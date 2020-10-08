// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

#include "node_crypto.h"
#include "async_wrap-inl.h"
#include "debug_utils-inl.h"
#include "threadpoolwork-inl.h"
#include "memory_tracker-inl.h"
#include "v8.h"

namespace node {

using v8::Context;
using v8::Local;
using v8::Object;
using v8::Value;

namespace crypto {

void Initialize(Local<Object> target,
                Local<Value> unused,
                Local<Context> context,
                void* priv) {
  static uv_once_t init_once = UV_ONCE_INIT;
  uv_once(&init_once, InitCryptoOnce);

  Environment* env = Environment::GetCurrent(context);

  AES::Initialize(env, target);
  CipherBase::Initialize(env, target);
  DiffieHellman::Initialize(env, target);
  DSAAlg::Initialize(env, target);
  ECDH::Initialize(env, target);
  Hash::Initialize(env, target);
  HKDFJob::Initialize(env, target);
  Hmac::Initialize(env, target);
  Keygen::Initialize(env, target);
  Keys::Initialize(env, target);
  NativeKeyObject::Initialize(env, target);
  PBKDF2Job::Initialize(env, target);
  Random::Initialize(env, target);
  RSAAlg::Initialize(env, target);
  ScryptJob::Initialize(env, target);
  SecureContext::Initialize(env, target);
  Sign::Initialize(env, target);
  SPKAC::Initialize(env, target);
  Timing::Initialize(env, target);
  Util::Initialize(env, target);
  Verify::Initialize(env, target);
}

}  // namespace crypto
}  // namespace node

NODE_MODULE_CONTEXT_AWARE_INTERNAL(crypto, node::crypto::Initialize)
