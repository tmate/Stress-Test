#include "inspector_agent.h"

#include "node.h"
#include "env.h"
#include "env-inl.h"
#include "node_version.h"
#include "v8-platform.h"
#include "util.h"

#include "platform/v8_inspector/public/V8Inspector.h"
#include "platform/inspector_protocol/FrontendChannel.h"
#include "platform/inspector_protocol/String16.h"
#include "platform/inspector_protocol/Values.h"

#include "libplatform/libplatform.h"

#include <string.h>

// We need pid to use as ID with Chrome
#if defined(_MSC_VER)
#include <direct.h>
#include <io.h>
#define getpid GetCurrentProcessId
#else
#include <unistd.h>  // setuid, getuid
#endif

namespace node {
namespace {

const char DEVTOOLS_PATH[] = "/node";

void PrintDebuggerReadyMessage(int port) {
  fprintf(stderr, "Debugger listening on port %d.\n"
    "To start debugging, open the following URL in Chrome:\n"
    "    chrome-devtools://devtools/remote/serve_file/"
    "@521e5b7e2b7cc66b4006a8a54cb9c4e57494a5ef/inspector.html?"
    "experiments=true&v8only=true&ws=localhost:%d/node\n", port, port);
}

bool AcceptsConnection(inspector_socket_t* socket, const char* path) {
  return strncmp(DEVTOOLS_PATH, path, sizeof(DEVTOOLS_PATH)) == 0;
}

void DisposeInspector(inspector_socket_t* socket, int status) {
  free(socket);
}

void DisconnectAndDisposeIO(inspector_socket_t* socket) {
  if (socket) {
    inspector_close(socket, DisposeInspector);
  }
}

void OnBufferAlloc(uv_handle_t* handle, size_t len, uv_buf_t* buf) {
  if (len > 0) {
    buf->base = static_cast<char*>(malloc(len));
    CHECK_NE(buf->base, nullptr);
  }
  buf->len = len;
}

void SendHttpResponse(inspector_socket_t* socket, const char* response,
                      size_t len) {
  const char HEADERS[] = "HTTP/1.0 200 OK\r\n"
                         "Content-Type: application/json; charset=UTF-8\r\n"
                         "Cache-Control: no-cache\r\n"
                         "Content-Length: %ld\r\n"
                         "\r\n";
  char header[sizeof(HEADERS) + 20];
  int header_len = snprintf(header, sizeof(header), HEADERS, len);
  inspector_write(socket, header, header_len);
  inspector_write(socket, response, len);
}

void SendVersionResponse(inspector_socket_t* socket) {
  const char VERSION_RESPONSE_TEMPLATE[] =
      "[ {"
      "  \"Browser\": \"node.js/%s\","
      "  \"Protocol-Version\": \"1.1\","
      "  \"User-Agent\": \"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
            "(KHTML, like Gecko) Chrome/45.0.2446.0 Safari/537.36\","
      "  \"WebKit-Version\": \"537.36 (@198122)\""
      "} ]";
  char buffer[sizeof(VERSION_RESPONSE_TEMPLATE) + 128];
  size_t len = snprintf(buffer, sizeof(buffer), VERSION_RESPONSE_TEMPLATE,
                        NODE_VERSION);
  ASSERT_LT(len, sizeof(buffer));
  SendHttpResponse(socket, buffer, len);
}

void SendTargentsListResponse(inspector_socket_t* socket) {
  const char LIST_RESPONSE_TEMPLATE[] =
      "[ {"
      "  \"description\": \"node.js instance\","
      "  \"devtoolsFrontendUrl\": "
            "\"https://chrome-devtools-frontend.appspot.com/serve_file/"
            "@4604d24a75168768584760ba56d175507941852f/inspector.html\","
      "  \"faviconUrl\": \"https://nodejs.org/static/favicon.ico\","
      "  \"id\": \"%d\","
      "  \"title\": \"%s\","
      "  \"type\": \"node\","
      "  \"webSocketDebuggerUrl\": \"ws://%s\""
      "} ]";
  char buffer[sizeof(LIST_RESPONSE_TEMPLATE) + 4096];
  char title[2048];  // uv_get_process_title trims the title if too long
  int err = uv_get_process_title(title, sizeof(title));
  ASSERT_EQ(0, err);
  char* c = title;
  while (!c) {
    if (*c < ' ' || *c == '\"') {
      *c = '_';
    }
    c++;
  }
  size_t len = snprintf(buffer, sizeof(buffer), LIST_RESPONSE_TEMPLATE,
                        getpid(), title, DEVTOOLS_PATH);
  ASSERT_LT(len, sizeof(buffer));
  SendHttpResponse(socket, buffer, len);
}

bool RespondToGet(inspector_socket_t* socket, const char* path) {
  const char PATH[] = "/json";
  const char PATH_LIST[] = "/json/list";
  const char PATH_VERSION[] = "/json/version";
  const char PATH_ACTIVATE[] = "/json/activate/";
  if (!strncmp(PATH_VERSION, path, sizeof(PATH_VERSION))) {
    SendVersionResponse(socket);
  } else if (!strncmp(PATH_LIST, path, sizeof(PATH_LIST)) ||
             !strncmp(PATH, path, sizeof(PATH)))  {
    SendTargentsListResponse(socket);
  } else if (!strncmp(path, PATH_ACTIVATE, sizeof(PATH_ACTIVATE) - 1) &&
             atoi(path + (sizeof(PATH_ACTIVATE) - 1)) == getpid()) {
    const char TARGET_ACTIVATED[] = "Target activated";
    SendHttpResponse(socket, TARGET_ACTIVATED, sizeof(TARGET_ACTIVATED) - 1);
  } else {
    return false;
  }
  return true;
}

}  // namespace

namespace inspector {

using blink::protocol::DictionaryValue;
using blink::protocol::String16;

void InterruptCallback(v8::Isolate*, void* agent) {
  static_cast<Agent*>(agent)->PostMessages();
}

class DispatchOnInspectorBackendTask : public v8::Task {
 public:
  explicit DispatchOnInspectorBackendTask(Agent* agent) : agent_(agent) {}

  void Run() override {
    agent_->PostMessages();
  }

 private:
  Agent* agent_;
};

class ChannelImpl final : public blink::protocol::FrontendChannel {
 public:
  explicit ChannelImpl(Agent* agent): agent_(agent) {}
  virtual ~ChannelImpl() {}
 private:
  virtual void sendProtocolResponse(int sessionId, int callId,
                                    std::unique_ptr<DictionaryValue> message)
                                    override {
    sendMessageToFrontend(std::move(message));
  }

  virtual void sendProtocolNotification(
      std::unique_ptr<DictionaryValue> message) override {
    sendMessageToFrontend(std::move(message));
  }

  virtual void flush() override { }

  void sendMessageToFrontend(std::unique_ptr<DictionaryValue> message) {
    agent_->Write(message->toJSONString().utf8());
  }

  Agent* const agent_;
};

class SetConnectedTask : public v8::Task {
 public:
  SetConnectedTask(Agent* agent, bool connected)
     : agent_(agent),
       connected_(connected) {}

  void Run() override {
    agent_->SetConnected(connected_);
  }

 private:
  Agent* agent_;
  bool connected_;
};

class V8NodeInspector : public blink::V8Inspector {
 public:
  V8NodeInspector(Agent* agent, node::Environment* env, v8::Platform* platform)
      : blink::V8Inspector(env->isolate(), env->context()),
        agent_(agent),
        isolate_(env->isolate()),
        platform_(platform),
        terminated_(false),
        running_nested_loop_(false) {}

  void runMessageLoopOnPause(int context_group_id) override {
    if (running_nested_loop_)
      return;
    terminated_ = false;
    running_nested_loop_ = true;
    do {
      uv_mutex_lock(&agent_->pause_lock_);
      uv_cond_wait(&agent_->pause_cond_, &agent_->pause_lock_);
      uv_mutex_unlock(&agent_->pause_lock_);
      while (v8::platform::PumpMessageLoop(platform_, isolate_))
        {}
    } while (!terminated_);
    terminated_ = false;
    running_nested_loop_ = false;
  }

  void quitMessageLoopOnPause() override {
    terminated_ = true;
  }

 private:
  Agent* agent_;
  v8::Isolate* isolate_;
  v8::Platform* platform_;
  bool terminated_;
  bool running_nested_loop_;
};

Agent::Agent(Environment* env) : port_(9229),
                                 wait_(false),
                                 connected_(false),
                                 shutting_down_(false),
                                 parent_env_(env),
                                 client_socket_(nullptr),
                                 inspector_(nullptr),
                                 platform_(nullptr),
                                 dispatching_messages_(false) {
  int err;
  err = uv_sem_init(&start_sem_, 0);
  CHECK_EQ(err, 0);
}

Agent::~Agent() {
  if (!inspector_)
    return;
  uv_mutex_destroy(&queue_lock_);
  uv_mutex_destroy(&pause_lock_);
  uv_cond_destroy(&pause_cond_);
  uv_close(reinterpret_cast<uv_handle_t*>(&data_written_), nullptr);
}

void Agent::Start(v8::Platform* platform, int port, bool wait) {
  auto env = parent_env_;
  inspector_ = new V8NodeInspector(this, env, platform);

  int err;

  platform_ = platform;

  err = uv_loop_init(&child_loop_);
  CHECK_EQ(err, 0);
  err = uv_async_init(env->event_loop(), &data_written_, nullptr);
  CHECK_EQ(err, 0);
  err = uv_mutex_init(&queue_lock_);
  CHECK_EQ(err, 0);
  err = uv_mutex_init(&pause_lock_);
  CHECK_EQ(err, 0);
  err = uv_cond_init(&pause_cond_);
  CHECK_EQ(err, 0);

  uv_unref(reinterpret_cast<uv_handle_t*>(&data_written_));

  port_ = port;
  wait_ = wait;

  err = uv_thread_create(&thread_, Agent::ThreadCbIO, this);
  CHECK_EQ(err, 0);
  uv_sem_wait(&start_sem_);

  if (wait) {
    // Flush messages in case of wait to connect, see OnRemoteDataIO on how it
    // should be fixed.
    SetConnected(true);
    PostMessages();
  }
}

void Agent::Stop() {
  // TODO(repenaxa): hop on the right thread.
  DisconnectAndDisposeIO(client_socket_);
  int err = uv_thread_join(&thread_);
  CHECK_EQ(err, 0);

  uv_run(&child_loop_, UV_RUN_NOWAIT);

  err = uv_loop_close(&child_loop_);
  CHECK_EQ(err, 0);
  delete inspector_;
}

bool Agent::IsStarted() {
  return !!platform_;
}

void Agent::WaitForDisconnect() {
  shutting_down_ = true;
  fprintf(stderr, "Waiting for the debugger to disconnect...\n");
  inspector_->runMessageLoopOnPause(0);
}

// static
void Agent::ThreadCbIO(void* agent) {
  static_cast<Agent*>(agent)->WorkerRunIO();
}

// static
void Agent::OnSocketConnectionIO(uv_stream_t* server, int status) {
  if (status == 0) {
    inspector_socket_t* socket =
        static_cast<inspector_socket_t*>(malloc(sizeof(*socket)));
    ASSERT_NE(nullptr, socket);
    memset(socket, 0, sizeof(*socket));
    socket->data = server->data;
    if (inspector_accept(server, socket, Agent::OnInspectorHandshakeIO) != 0) {
      free(socket);
    }
  }
}

// static
bool Agent::OnInspectorHandshakeIO(inspector_socket_t* socket,
                                   enum inspector_handshake_event state,
                                   const char* path) {
  Agent* agent = static_cast<Agent*>(socket->data);
  switch (state) {
  case kInspectorHandshakeHttpGet:
    return RespondToGet(socket, path);
  case kInspectorHandshakeUpgrading:
    return AcceptsConnection(socket, path);
  case kInspectorHandshakeUpgraded:
    agent->OnInspectorConnectionIO(socket);
    return true;
  case kInspectorHandshakeFailed:
    return false;
  default:
    UNREACHABLE();
  }
}

// static
void Agent::OnRemoteDataIO(uv_stream_t* stream,
                           ssize_t read,
                           const uv_buf_t* b) {
  inspector_socket_t* socket = static_cast<inspector_socket_t*>(stream->data);
  Agent* agent = static_cast<Agent*>(socket->data);
  if (read > 0) {
    std::string str(b->base, read);
    agent->PushPendingMessage(&agent->message_queue_, str);
    free(b->base);

    // TODO(pfeldman): Instead of blocking execution while debugger
    // engages, node should wait for the run callback from the remote client
    // and initiate its startup. This is a change to node.cc that should be
    // upstreamed separately.
    if (agent->wait_ && str.find("\"Runtime.run\"") != std::string::npos) {
      agent->wait_ = false;
      uv_sem_post(&agent->start_sem_);
    }

    agent->platform_->CallOnForegroundThread(agent->parent_env_->isolate(),
        new DispatchOnInspectorBackendTask(agent));
    agent->parent_env_->isolate()
        ->RequestInterrupt(InterruptCallback, agent);
    uv_async_send(&agent->data_written_);
  } else if (read < 0) {
    if (agent->client_socket_ == socket) {
      agent->client_socket_ = nullptr;
    }
    DisconnectAndDisposeIO(socket);
  } else {
    // EOF
    if (agent->client_socket_ == socket) {
      agent->client_socket_ = nullptr;
      agent->platform_->CallOnForegroundThread(agent->parent_env_->isolate(),
          new SetConnectedTask(agent, false));
      uv_async_send(&agent->data_written_);
    }
  }
  uv_cond_broadcast(&agent->pause_cond_);
}

void Agent::PushPendingMessage(std::vector<std::string>* queue,
                               const std::string& message) {
  uv_mutex_lock(&queue_lock_);
  queue->push_back(message);
  uv_mutex_unlock(&queue_lock_);
}

void Agent::SwapBehindLock(std::vector<std::string> Agent::*queue,
                           std::vector<std::string>* output) {
  uv_mutex_lock(&queue_lock_);
  (this->*queue).swap(*output);
  uv_mutex_unlock(&queue_lock_);
}

// static
void Agent::WriteCbIO(uv_async_t* async) {
  Agent* agent = static_cast<Agent*>(async->data);
  inspector_socket_t* socket = agent->client_socket_;
  if (socket) {
    std::vector<std::string> outgoing_messages;
    agent->SwapBehindLock(&Agent::outgoing_message_queue_, &outgoing_messages);
    for (auto const& message : outgoing_messages)
      inspector_write(socket, message.c_str(), message.length());
  }
}

void Agent::WorkerRunIO() {
  sockaddr_in addr;
  uv_tcp_t server;
  int err = uv_async_init(&child_loop_, &io_thread_req_, Agent::WriteCbIO);
  CHECK_EQ(0, err);
  io_thread_req_.data = this;
  uv_tcp_init(&child_loop_, &server);
  uv_ip4_addr("0.0.0.0", port_, &addr);
  server.data = this;
  err = uv_tcp_bind(&server,
                    reinterpret_cast<const struct sockaddr*>(&addr), 0);
  if (err == 0) {
    err = uv_listen(reinterpret_cast<uv_stream_t*>(&server), 1,
                    OnSocketConnectionIO);
  }
  if (err == 0) {
    PrintDebuggerReadyMessage(port_);
  } else {
    fprintf(stderr, "Unable to open devtools socket: %s\n", uv_strerror(err));
    ABORT();
  }
  if (!wait_) {
    uv_sem_post(&start_sem_);
  }
  uv_run(&child_loop_, UV_RUN_DEFAULT);
  uv_close(reinterpret_cast<uv_handle_t*>(&io_thread_req_), nullptr);
  uv_close(reinterpret_cast<uv_handle_t*>(&server), nullptr);
  uv_run(&child_loop_, UV_RUN_DEFAULT);
}

void Agent::OnInspectorConnectionIO(inspector_socket_t* socket) {
  if (client_socket_) {
    return;
  }
  client_socket_ = socket;
  inspector_read_start(socket, OnBufferAlloc, Agent::OnRemoteDataIO);
  platform_->CallOnForegroundThread(parent_env_->isolate(),
      new SetConnectedTask(this, true));
}

void Agent::PostMessages() {
  if (dispatching_messages_)
    return;
  dispatching_messages_ = true;
  std::vector<std::string> messages;
  SwapBehindLock(&Agent::message_queue_, &messages);
  for (auto const& message : messages)
    inspector_->dispatchMessageFromFrontend(
        String16::fromUTF8(message.c_str(), message.length()));
  uv_async_send(&data_written_);
  dispatching_messages_ = false;
}

void Agent::SetConnected(bool connected) {
  if (connected_ == connected)
    return;

  connected_ = connected;
  if (connected) {
    fprintf(stderr, "Debugger attached.\n");
    inspector_->connectFrontend(new ChannelImpl(this));
  } else {
    if (!shutting_down_)
      PrintDebuggerReadyMessage(port_);
    inspector_->quitMessageLoopOnPause();
    inspector_->disconnectFrontend();
  }
}

void Agent::Write(const std::string& message) {
  PushPendingMessage(&outgoing_message_queue_, message);
  ASSERT_EQ(0, uv_async_send(&io_thread_req_));
}
}  // namespace debugger
}  // namespace node
