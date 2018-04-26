'use strict';

const {
  ERR_CRYPTO_SIGN_KEY_REQUIRED,
  ERR_INVALID_ARG_TYPE,
  ERR_INVALID_OPT_VALUE
} = require('internal/errors').codes;
const {
  Sign: _Sign,
  Verify: _Verify
} = process.binding('crypto');
const {
  RSA_PSS_SALTLEN_AUTO,
  RSA_PKCS1_PADDING
} = process.binding('constants').crypto;
const {
  getDefaultEncoding,
  toBuf
} = require('internal/crypto/util');
const { isArrayBufferView } = require('internal/util/types');
const { Writable } = require('stream');
const { inherits } = require('util');

function Sign(algorithm, options) {
  if (!(this instanceof Sign))
    return new Sign(algorithm, options);
  if (typeof algorithm !== 'string')
    throw new ERR_INVALID_ARG_TYPE('algorithm', 'string', algorithm);
  this._handle = new _Sign();
  this._handle.init(algorithm);

  Writable.call(this, options);
}

inherits(Sign, Writable);

Sign.prototype._write = function _write(chunk, encoding, callback) {
  this.update(chunk, encoding);
  callback();
};

Sign.prototype.update = function update(data, encoding) {
  encoding = encoding || getDefaultEncoding();
  data = toBuf(data, encoding);
  if (!isArrayBufferView(data)) {
    throw new ERR_INVALID_ARG_TYPE(
      'data',
      ['string', 'Buffer', 'TypedArray', 'DataView'],
      data
    );
  }
  this._handle.update(data);
  return this;
};

function getPadding(options) {
  return getIntOption('padding', RSA_PKCS1_PADDING, options);
}

function getSaltLength(options) {
  return getIntOption('saltLength', RSA_PSS_SALTLEN_AUTO, options);
}

function getIntOption(name, defaultValue, options) {
  if (options.hasOwnProperty(name)) {
    if (options[name] === options[name] >> 0) {
      return options[name];
    } else {
      throw new ERR_INVALID_OPT_VALUE(name, options[name]);
    }
  }
  return defaultValue;
}

Sign.prototype.sign = function sign(options, encoding) {
  if (!options)
    throw new ERR_CRYPTO_SIGN_KEY_REQUIRED();

  var key = options.key || options;
  var passphrase = options.passphrase || null;

  // Options specific to RSA
  var rsaPadding = getPadding(options);

  var pssSaltLength = getSaltLength(options);

  key = toBuf(key);
  if (!isArrayBufferView(key)) {
    throw new ERR_INVALID_ARG_TYPE(
      'key',
      ['string', 'Buffer', 'TypedArray', 'DataView'],
      key
    );
  }

  var ret = this._handle.sign(key, passphrase, rsaPadding, pssSaltLength);

  encoding = encoding || getDefaultEncoding();
  if (encoding && encoding !== 'buffer')
    ret = ret.toString(encoding);

  return ret;
};


function Verify(algorithm, options) {
  if (!(this instanceof Verify))
    return new Verify(algorithm, options);
  if (typeof algorithm !== 'string')
    throw new ERR_INVALID_ARG_TYPE('algorithm', 'string', algorithm);
  this._handle = new _Verify();
  this._handle.init(algorithm);

  Writable.call(this, options);
}

inherits(Verify, Writable);

Verify.prototype._write = Sign.prototype._write;
Verify.prototype.update = Sign.prototype.update;

Verify.prototype.verify = function verify(options, signature, sigEncoding) {
  var key = options.key || options;
  sigEncoding = sigEncoding || getDefaultEncoding();

  // Options specific to RSA
  var rsaPadding = getPadding(options);

  var pssSaltLength = getSaltLength(options);

  key = toBuf(key);
  if (!isArrayBufferView(key)) {
    throw new ERR_INVALID_ARG_TYPE(
      'key',
      ['string', 'Buffer', 'TypedArray', 'DataView'],
      key
    );
  }

  signature = toBuf(signature, sigEncoding);
  if (!isArrayBufferView(signature)) {
    throw new ERR_INVALID_ARG_TYPE(
      'signature',
      ['string', 'Buffer', 'TypedArray', 'DataView'],
      signature
    );
  }

  return this._handle.verify(key, signature, rsaPadding, pssSaltLength);
};

module.exports = {
  Sign,
  Verify
};
