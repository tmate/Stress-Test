#include "crypto/crypto_util.h"
#include "crypto/crypto_bio.h"
#include "crypto/crypto_keys.h"
#include "allocated_buffer-inl.h"
#include "async_wrap-inl.h"
#include "env-inl.h"
#include "memory_tracker-inl.h"
#include "node_buffer.h"
#include "node_options-inl.h"
#include "string_bytes.h"
#include "threadpoolwork-inl.h"
#include "util-inl.h"
#include "v8.h"

#include "math.h"

namespace node {

using v8::ArrayBuffer;
using v8::BackingStore;
using v8::Context;
using v8::Exception;
using v8::FunctionCallbackInfo;
using v8::HandleScope;
using v8::Isolate;
using v8::Just;
using v8::Local;
using v8::Maybe;
using v8::MaybeLocal;
using v8::NewStringType;
using v8::Nothing;
using v8::Object;
using v8::String;
using v8::Value;

namespace crypto {
int VerifyCallback(int preverify_ok, X509_STORE_CTX* ctx) {
  // From https://www.openssl.org/docs/man1.1.1/man3/SSL_verify_cb:
  //
  //   If VerifyCallback returns 1, the verification process is continued. If
  //   VerifyCallback always returns 1, the TLS/SSL handshake will not be
  //   terminated with respect to verification failures and the connection will
  //   be established. The calling process can however retrieve the error code
  //   of the last verification error using SSL_get_verify_result(3) or by
  //   maintaining its own error storage managed by VerifyCallback.
  //
  // Since we cannot perform I/O quickly enough with X509_STORE_CTX_ APIs in
  // this callback, we ignore all preverify_ok errors and let the handshake
  // continue. It is imperative that the user use Connection::VerifyError after
  // the 'secure' callback has been made.
  return 1;
}

void CheckEntropy() {
  for (;;) {
    int status = RAND_status();
    CHECK_GE(status, 0);  // Cannot fail.
    if (status != 0)
      break;

    // Give up, RAND_poll() not supported.
    if (RAND_poll() == 0)
      break;
  }
}

bool EntropySource(unsigned char* buffer, size_t length) {
  // Ensure that OpenSSL's PRNG is properly seeded.
  CheckEntropy();
  // RAND_bytes() can return 0 to indicate that the entropy data is not truly
  // random. That's okay, it's still better than V8's stock source of entropy,
  // which is /dev/urandom on UNIX platforms and the current time on Windows.
  return RAND_bytes(buffer, length) != -1;
}

int PasswordCallback(char* buf, int size, int rwflag, void* u) {
  const char* passphrase = static_cast<char*>(u);
  if (passphrase != nullptr) {
    size_t buflen = static_cast<size_t>(size);
    size_t len = strlen(passphrase);
    if (buflen < len)
      return -1;
    memcpy(buf, passphrase, len);
    return len;
  }

  return -1;
}

// This callback is used to avoid the default passphrase callback in OpenSSL
// which will typically prompt for the passphrase. The prompting is designed
// for the OpenSSL CLI, but works poorly for Node.js because it involves
// synchronous interaction with the controlling terminal, something we never
// want, and use this function to avoid it.
int NoPasswordCallback(char* buf, int size, int rwflag, void* u) {
  return 0;
}

void InitCryptoOnce() {
#ifndef OPENSSL_IS_BORINGSSL
  OPENSSL_INIT_SETTINGS* settings = OPENSSL_INIT_new();

  // --openssl-config=...
  if (!per_process::cli_options->openssl_config.empty()) {
    const char* conf = per_process::cli_options->openssl_config.c_str();
    OPENSSL_INIT_set_config_filename(settings, conf);
  }

  OPENSSL_init_ssl(0, settings);
  OPENSSL_INIT_free(settings);
  settings = nullptr;
#endif

#ifdef NODE_FIPS_MODE
  /* Override FIPS settings in cnf file, if needed. */
  unsigned long err = 0;  // NOLINT(runtime/int)
  if (per_process::cli_options->enable_fips_crypto ||
      per_process::cli_options->force_fips_crypto) {
    if (0 == FIPS_mode() && !FIPS_mode_set(1)) {
      err = ERR_get_error();
    }
  }
  if (0 != err) {
    fprintf(stderr,
            "openssl fips failed: %s\n",
            ERR_error_string(err, nullptr));
    UNREACHABLE();
  }
#endif  // NODE_FIPS_MODE

  // Turn off compression. Saves memory and protects against CRIME attacks.
  // No-op with OPENSSL_NO_COMP builds of OpenSSL.
  sk_SSL_COMP_zero(SSL_COMP_get_compression_methods());

#ifndef OPENSSL_NO_ENGINE
  ERR_load_ENGINE_strings();
  ENGINE_load_builtin_engines();
#endif  // !OPENSSL_NO_ENGINE

  NodeBIO::GetMethod();
}

#ifdef NODE_FIPS_MODE
void GetFipsCrypto(const FunctionCallbackInfo<Value>& args) {
  args.GetReturnValue().Set(FIPS_mode() ? 1 : 0);
}

void SetFipsCrypto(const FunctionCallbackInfo<Value>& args) {
  CHECK(!per_process::cli_options->force_fips_crypto);
  Environment* env = Environment::GetCurrent(args);
  bool enable = args[0]->BooleanValue(env->isolate());

  if (enable == FIPS_mode())
    return;  // No action needed.

  if (!FIPS_mode_set(enable)) {
    unsigned long err = ERR_get_error();  // NOLINT(runtime/int)
    return ThrowCryptoError(env, err);
  }
}
#endif /* NODE_FIPS_MODE */

void CryptoErrorVector::Capture() {
  clear();
  while (auto err = ERR_get_error()) {
    char buf[256];
    ERR_error_string_n(err, buf, sizeof(buf));
    push_back(buf);
  }
  std::reverse(begin(), end());
}

MaybeLocal<Value> CryptoErrorVector::ToException(
    Environment* env,
    Local<String> exception_string) const {
  if (exception_string.IsEmpty()) {
    CryptoErrorVector copy(*this);
    if (copy.empty()) copy.push_back("no error");  // But possibly a bug...
    // Use last element as the error message, everything else goes
    // into the .opensslErrorStack property on the exception object.
    Local<String> exception_string;
    if (!String::NewFromUtf8(
            env->isolate(),
            copy.back().data(),
            NewStringType::kNormal,
            copy.back().size()).ToLocal(&exception_string)) {
      return MaybeLocal<Value>();
    }
    copy.pop_back();
    return copy.ToException(env, exception_string);
  }

  Local<Value> exception_v = Exception::Error(exception_string);
  CHECK(!exception_v.IsEmpty());

  if (!empty()) {
    CHECK(exception_v->IsObject());
    Local<Object> exception = exception_v.As<Object>();
    Local<Value> stack;
    if (!ToV8Value(env->context(), *this).ToLocal(&stack) ||
        exception->Set(env->context(), env->openssl_error_stack(), stack)
            .IsNothing()) {
      return MaybeLocal<Value>();
    }
  }

  return exception_v;
}

ByteSource::ByteSource(ByteSource&& other) noexcept
    : data_(other.data_),
      allocated_data_(other.allocated_data_),
      size_(other.size_) {
  other.allocated_data_ = nullptr;
}

ByteSource::~ByteSource() {
  OPENSSL_clear_free(allocated_data_, size_);
}

void ByteSource::reset() {
  OPENSSL_clear_free(allocated_data_, size_);
  data_ = nullptr;
  size_ = 0;
}

ByteSource& ByteSource::operator=(ByteSource&& other) noexcept {
  if (&other != this) {
    OPENSSL_clear_free(allocated_data_, size_);
    data_ = other.data_;
    allocated_data_ = other.allocated_data_;
    other.allocated_data_ = nullptr;
    size_ = other.size_;
  }
  return *this;
}

std::unique_ptr<BackingStore> ByteSource::ReleaseToBackingStore() {
  CHECK_NOT_NULL(allocated_data_);
  std::unique_ptr<BackingStore> ptr = ArrayBuffer::NewBackingStore(
      allocated_data_,
      size(),
      [](void* data, size_t length, void* deleter_data) {
        OPENSSL_clear_free(deleter_data, length);
      }, allocated_data_);
  CHECK(ptr);
  allocated_data_ = nullptr;
  data_ = nullptr;
  size_ = 0;
  return ptr;
}

Local<ArrayBuffer> ByteSource::ToArrayBuffer(Environment* env) {
  std::unique_ptr<BackingStore> store = ReleaseToBackingStore();
  return ArrayBuffer::New(env->isolate(), std::move(store));
}

const char* ByteSource::get() const {
  return data_;
}

size_t ByteSource::size() const {
  return size_;
}

ByteSource ByteSource::FromBIO(const BIOPointer& bio) {
  CHECK(bio);
  BUF_MEM* bptr;
  BIO_get_mem_ptr(bio.get(), &bptr);
  char* data = MallocOpenSSL<char>(bptr->length);
  memcpy(data, bptr->data, bptr->length);
  return Allocated(data, bptr->length);
}

ByteSource ByteSource::FromEncodedString(Environment* env,
                                         Local<String> key,
                                         enum encoding enc) {
  size_t length = 0;
  size_t actual = 0;
  char* data = nullptr;

  if (StringBytes::Size(env->isolate(), key, enc).To(&length) && length > 0) {
    data = MallocOpenSSL<char>(length);
    actual = StringBytes::Write(env->isolate(), data, length, key, enc);

    CHECK(actual <= length);

    if (actual == 0) {
      OPENSSL_clear_free(data, length);
      data = nullptr;
    } else if (actual < length) {
      data = reinterpret_cast<char*>(OPENSSL_realloc(data, actual));
    }
  }

  return Allocated(data, actual);
}

ByteSource ByteSource::FromStringOrBuffer(Environment* env,
                                          Local<Value> value) {
  return IsAnyByteSource(value) ? FromBuffer(value)
                                : FromString(env, value.As<String>());
}

ByteSource ByteSource::FromString(Environment* env, Local<String> str,
                                  bool ntc) {
  CHECK(str->IsString());
  size_t size = str->Utf8Length(env->isolate());
  size_t alloc_size = ntc ? size + 1 : size;
  char* data = MallocOpenSSL<char>(alloc_size);
  int opts = String::NO_OPTIONS;
  if (!ntc) opts |= String::NO_NULL_TERMINATION;
  str->WriteUtf8(env->isolate(), data, alloc_size, nullptr, opts);
  return Allocated(data, size);
}

ByteSource ByteSource::FromBuffer(Local<Value> buffer, bool ntc) {
  ArrayBufferOrViewContents<char> buf(buffer);
  return ntc ? buf.ToNullTerminatedCopy() : buf.ToByteSource();
}

ByteSource ByteSource::FromSecretKeyBytes(
    Environment* env,
    Local<Value> value) {
  // A key can be passed as a string, buffer or KeyObject with type 'secret'.
  // If it is a string, we need to convert it to a buffer. We are not doing that
  // in JS to avoid creating an unprotected copy on the heap.
  return value->IsString() || IsAnyByteSource(value) ?
           ByteSource::FromStringOrBuffer(env, value) :
           ByteSource::FromSymmetricKeyObjectHandle(value);
}

ByteSource ByteSource::NullTerminatedCopy(Environment* env,
                                          Local<Value> value) {
  return Buffer::HasInstance(value) ? FromBuffer(value, true)
                                    : FromString(env, value.As<String>(), true);
}

ByteSource ByteSource::FromSymmetricKeyObjectHandle(Local<Value> handle) {
  CHECK(handle->IsObject());
  KeyObjectHandle* key = Unwrap<KeyObjectHandle>(handle.As<Object>());
  CHECK_NOT_NULL(key);
  return Foreign(key->Data()->GetSymmetricKey(),
                 key->Data()->GetSymmetricKeySize());
}

ByteSource::ByteSource(const char* data, char* allocated_data, size_t size)
    : data_(data),
      allocated_data_(allocated_data),
      size_(size) {}

ByteSource ByteSource::Allocated(char* data, size_t size) {
  return ByteSource(data, data, size);
}

ByteSource ByteSource::Foreign(const char* data, size_t size) {
  return ByteSource(data, nullptr, size);
}

namespace error {
Maybe<bool> Decorate(Environment* env, Local<Object> obj,
              unsigned long err) {  // NOLINT(runtime/int)
  if (err == 0) return Just(true);  // No decoration necessary.

  const char* ls = ERR_lib_error_string(err);
  const char* fs = ERR_func_error_string(err);
  const char* rs = ERR_reason_error_string(err);

  Isolate* isolate = env->isolate();
  Local<Context> context = isolate->GetCurrentContext();

  if (ls != nullptr) {
    if (obj->Set(context, env->library_string(),
                 OneByteString(isolate, ls)).IsNothing()) {
      return Nothing<bool>();
    }
  }
  if (fs != nullptr) {
    if (obj->Set(context, env->function_string(),
                 OneByteString(isolate, fs)).IsNothing()) {
      return Nothing<bool>();
    }
  }
  if (rs != nullptr) {
    if (obj->Set(context, env->reason_string(),
                 OneByteString(isolate, rs)).IsNothing()) {
      return Nothing<bool>();
    }

    // SSL has no API to recover the error name from the number, so we
    // transform reason strings like "this error" to "ERR_SSL_THIS_ERROR",
    // which ends up being close to the original error macro name.
    std::string reason(rs);

    for (auto& c : reason) {
      if (c == ' ')
        c = '_';
      else
        c = ToUpper(c);
    }

#define OSSL_ERROR_CODES_MAP(V)                                               \
    V(SYS)                                                                    \
    V(BN)                                                                     \
    V(RSA)                                                                    \
    V(DH)                                                                     \
    V(EVP)                                                                    \
    V(BUF)                                                                    \
    V(OBJ)                                                                    \
    V(PEM)                                                                    \
    V(DSA)                                                                    \
    V(X509)                                                                   \
    V(ASN1)                                                                   \
    V(CONF)                                                                   \
    V(CRYPTO)                                                                 \
    V(EC)                                                                     \
    V(SSL)                                                                    \
    V(BIO)                                                                    \
    V(PKCS7)                                                                  \
    V(X509V3)                                                                 \
    V(PKCS12)                                                                 \
    V(RAND)                                                                   \
    V(DSO)                                                                    \
    V(ENGINE)                                                                 \
    V(OCSP)                                                                   \
    V(UI)                                                                     \
    V(COMP)                                                                   \
    V(ECDSA)                                                                  \
    V(ECDH)                                                                   \
    V(OSSL_STORE)                                                             \
    V(FIPS)                                                                   \
    V(CMS)                                                                    \
    V(TS)                                                                     \
    V(HMAC)                                                                   \
    V(CT)                                                                     \
    V(ASYNC)                                                                  \
    V(KDF)                                                                    \
    V(SM2)                                                                    \
    V(USER)                                                                   \

#define V(name) case ERR_LIB_##name: lib = #name "_"; break;
    const char* lib = "";
    const char* prefix = "OSSL_";
    switch (ERR_GET_LIB(err)) { OSSL_ERROR_CODES_MAP(V) }
#undef V
#undef OSSL_ERROR_CODES_MAP
    // Don't generate codes like "ERR_OSSL_SSL_".
    if (lib && strcmp(lib, "SSL_") == 0)
      prefix = "";

    // All OpenSSL reason strings fit in a single 80-column macro definition,
    // all prefix lengths are <= 10, and ERR_OSSL_ is 9, so 128 is more than
    // sufficient.
    char code[128];
    snprintf(code, sizeof(code), "ERR_%s%s%s", prefix, lib, reason.c_str());

    if (obj->Set(env->isolate()->GetCurrentContext(),
             env->code_string(),
             OneByteString(env->isolate(), code)).IsNothing())
      return Nothing<bool>();
  }

  return Just(true);
}
}  // namespace error

void ThrowCryptoError(Environment* env,
                      unsigned long err,  // NOLINT(runtime/int)
                      // Default, only used if there is no SSL `err` which can
                      // be used to create a long-style message string.
                      const char* message) {
  char message_buffer[128] = {0};
  if (err != 0 || message == nullptr) {
    ERR_error_string_n(err, message_buffer, sizeof(message_buffer));
    message = message_buffer;
  }
  HandleScope scope(env->isolate());
  Local<String> exception_string;
  Local<Value> exception;
  Local<Object> obj;
  if (!String::NewFromUtf8(env->isolate(), message).ToLocal(&exception_string))
    return;
  CryptoErrorVector errors;
  errors.Capture();
  if (!errors.ToException(env, exception_string).ToLocal(&exception) ||
      !exception->ToObject(env->context()).ToLocal(&obj) ||
      error::Decorate(env, obj, err).IsNothing()) {
    return;
  }
  env->isolate()->ThrowException(exception);
}

#ifndef OPENSSL_NO_ENGINE
EnginePointer LoadEngineById(const char* id, CryptoErrorVector* errors) {
  MarkPopErrorOnReturn mark_pop_error_on_return;

  EnginePointer engine(ENGINE_by_id(id));
  if (!engine) {
    // Engine not found, try loading dynamically.
    engine = EnginePointer(ENGINE_by_id("dynamic"));
    if (engine) {
      if (!ENGINE_ctrl_cmd_string(engine.get(), "SO_PATH", id, 0) ||
          !ENGINE_ctrl_cmd_string(engine.get(), "LOAD", nullptr, 0)) {
        engine.reset();
      }
    }
  }

  if (!engine && errors != nullptr) {
    if (ERR_get_error() != 0) {
      errors->Capture();
    } else {
      errors->push_back(std::string("Engine \"") + id + "\" was not found");
    }
  }

  return engine;
}

bool SetEngine(const char* id, uint32_t flags, CryptoErrorVector* errors) {
  ClearErrorOnReturn clear_error_on_return;
  EnginePointer engine = LoadEngineById(id, errors);
  if (!engine)
    return false;

  if (!ENGINE_set_default(engine.get(), flags)) {
    if (errors != nullptr)
      errors->Capture();
    return false;
  }

  return true;
}

void SetEngine(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);
  CHECK(args.Length() >= 2 && args[0]->IsString());
  uint32_t flags;
  if (!args[1]->Uint32Value(env->context()).To(&flags)) return;

  const node::Utf8Value engine_id(env->isolate(), args[0]);

  args.GetReturnValue().Set(SetEngine(*engine_id, flags));
}
#endif  // !OPENSSL_NO_ENGINE

MaybeLocal<Value> EncodeBignum(
    Environment* env,
    const BIGNUM* bn,
    int size,
    Local<Value>* error) {
  std::vector<uint8_t> buf(size);
  CHECK_EQ(BN_bn2binpad(bn, buf.data(), size), size);
  return StringBytes::Encode(
      env->isolate(),
      reinterpret_cast<const char*>(buf.data()),
      buf.size(),
      BASE64URL,
      error);
}

Maybe<bool> SetEncodedValue(
    Environment* env,
    Local<Object> target,
    Local<String> name,
    const BIGNUM* bn,
    int size) {
  Local<Value> value;
  Local<Value> error;
  CHECK_NOT_NULL(bn);
  if (size == 0)
    size = BN_num_bytes(bn);
  if (!EncodeBignum(env, bn, size, &error).ToLocal(&value)) {
    if (!error.IsEmpty())
      env->isolate()->ThrowException(error);
    return Nothing<bool>();
  }
  return target->Set(env->context(), name, value);
}

CryptoJobMode GetCryptoJobMode(v8::Local<v8::Value> args) {
  CHECK(args->IsUint32());
  uint32_t mode = args.As<v8::Uint32>()->Value();
  CHECK_LE(mode, kCryptoJobSync);
  return static_cast<CryptoJobMode>(mode);
}

namespace Util {
void Initialize(Environment* env, Local<Object> target) {
#ifndef OPENSSL_NO_ENGINE
  env->SetMethod(target, "setEngine", SetEngine);
#endif  // !OPENSSL_NO_ENGINE

#ifdef NODE_FIPS_MODE
  env->SetMethodNoSideEffect(target, "getFipsCrypto", GetFipsCrypto);
  env->SetMethod(target, "setFipsCrypto", SetFipsCrypto);
#endif

  NODE_DEFINE_CONSTANT(target, kCryptoJobAsync);
  NODE_DEFINE_CONSTANT(target, kCryptoJobSync);
}
}  // namespace Util

}  // namespace crypto
}  // namespace node
