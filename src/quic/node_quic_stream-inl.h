#ifndef SRC_QUIC_NODE_QUIC_STREAM_INL_H_
#define SRC_QUIC_NODE_QUIC_STREAM_INL_H_

#if defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#include "debug_utils-inl.h"
#include "node_quic_session.h"
#include "node_quic_stream.h"
#include "node_quic_buffer-inl.h"

namespace node {
namespace quic {

QuicStreamDirection QuicStream::direction() const {
  return stream_id_ & 0b10 ?
      QUIC_STREAM_UNIDIRECTIONAL :
      QUIC_STREAM_BIRECTIONAL;
}

QuicStreamOrigin QuicStream::origin() const {
  return stream_id_ & 0b01 ?
      QUIC_STREAM_SERVER :
      QUIC_STREAM_CLIENT;
}

bool QuicStream::is_flag_set(int32_t flag) const {
  return flags_ & (1 << flag);
}

void QuicStream::set_flag(int32_t flag, bool on) {
  if (on)
    flags_ |= (1 << flag);
  else
    flags_ &= ~(1 << flag);
}

void QuicStream::set_final_size(uint64_t final_size) {
  CHECK_EQ(GetStat(&QuicStreamStats::final_size), 0);
  SetStat(&QuicStreamStats::final_size, final_size);
}

bool QuicStream::is_destroyed() const {
  return is_flag_set(QUICSTREAM_FLAG_DESTROYED);
}

bool QuicStream::was_ever_writable() const {
  if (direction() == QUIC_STREAM_UNIDIRECTIONAL) {
    return session_->is_server() ?
        origin() == QUIC_STREAM_SERVER :
        origin() == QUIC_STREAM_CLIENT;
  }
  return true;
}

bool QuicStream::is_writable() const {
  return was_ever_writable() && !streambuf_.is_ended();
}

bool QuicStream::was_ever_readable() const {
  if (direction() == QUIC_STREAM_UNIDIRECTIONAL) {
    return session_->is_server() ?
        origin() == QUIC_STREAM_CLIENT :
        origin() == QUIC_STREAM_SERVER;
  }

  return true;
}

bool QuicStream::is_readable() const {
  return was_ever_readable() && !is_flag_set(QUICSTREAM_FLAG_READ_CLOSED);
}

void QuicStream::set_fin_sent() {
  CHECK(!is_writable());
  set_flag(QUICSTREAM_FLAG_FIN_SENT);
}

bool QuicStream::is_write_finished() const {
  return is_flag_set(QUICSTREAM_FLAG_FIN_SENT) &&
         streambuf_.length() == 0;
}

bool QuicStream::SubmitInformation(v8::Local<v8::Array> headers) {
  return session_->SubmitInformation(stream_id_, headers);
}

bool QuicStream::SubmitHeaders(v8::Local<v8::Array> headers, uint32_t flags) {
  return session_->SubmitHeaders(stream_id_, headers, flags);
}

bool QuicStream::SubmitTrailers(v8::Local<v8::Array> headers) {
  return session_->SubmitTrailers(stream_id_, headers);
}

BaseObjectPtr<QuicStream> QuicStream::SubmitPush(
    v8::Local<v8::Array> headers) {
  return session_->SubmitPush(stream_id_, headers);
}

void QuicStream::EndHeaders(int64_t push_id) {
  Debug(this, "End Headers");
  // Upon completion of a block of headers, convert the
  // vector of Header objects into an array of name+value
  // pairs, then call the on_stream_headers function.
  session()->application()->StreamHeaders(
      stream_id_,
      headers_kind_,
      headers_,
      push_id);
  headers_.clear();
}

void QuicStream::set_headers_kind(QuicStreamHeadersKind kind) {
  headers_kind_ = kind;
}

void QuicStream::BeginHeaders(QuicStreamHeadersKind kind) {
  Debug(this, "Beginning Headers");
  // Upon start of a new block of headers, ensure that any
  // previously collected ones are cleaned up.
  headers_.clear();
  set_headers_kind(kind);
}

void QuicStream::Commit(size_t amount) {
  CHECK(!is_destroyed());
  streambuf_.Seek(amount);
}

void QuicStream::ResetStream(uint64_t app_error_code) {
  // On calling shutdown, the stream will no longer be
  // readable or writable, all any pending data in the
  // streambuf_ will be canceled, and all data pending
  // to be acknowledged at the ngtcp2 level will be
  // abandoned.
  BaseObjectPtr<QuicSession> ptr(session_);
  set_flag(QUICSTREAM_FLAG_READ_CLOSED);
  session_->ResetStream(stream_id_, app_error_code);
  streambuf_.Cancel();
  streambuf_.End();
}

void QuicStream::Schedule(Queue* queue) {
  if (!stream_queue_.IsEmpty())  // Already scheduled?
    return;
  queue->PushBack(this);
}

void QuicStream::Unschedule() {
  stream_queue_.Remove();
}

}  // namespace quic
}  // namespace node

#endif  // NODE_WANT_INTERNALS

#endif  // SRC_QUIC_NODE_QUIC_STREAM_INL_H_
