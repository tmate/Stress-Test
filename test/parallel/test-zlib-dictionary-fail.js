'use strict';
const common = require('../common');
const assert = require('assert');
const zlib = require('zlib');

// Should raise an error, not trigger an assertion in src/node_zlib.cc
{
  const stream = zlib.createInflate();

  stream.on('error', common.mustCall(function(err) {
    assert(/Missing dictionary/.test(err.message));
  }));

  // String "test" encoded with dictionary "dict".
  stream.write(Buffer.from([0x78, 0xBB, 0x04, 0x09, 0x01, 0xA5]));
}

// Should raise an error, not trigger an assertion in src/node_zlib.cc
{
  const stream = zlib.createInflate({ dictionary: Buffer.from('fail') });

  stream.on('error', common.mustCall(function(err) {
    assert(/Bad dictionary/.test(err.message));
  }));

  // String "test" encoded with dictionary "dict".
  stream.write(Buffer.from([0x78, 0xBB, 0x04, 0x09, 0x01, 0xA5]));
}

// Should raise an error, not trigger an assertion in src/node_zlib.cc
{
  const stream = zlib.createInflateRaw({ dictionary: Buffer.from('fail') });

  stream.on('error', common.mustCall(function(err) {
    // It's not possible to separate invalid dict and invalid data when using
    // the raw format
    assert(/invalid/.test(err.message));
  }));

  // String "test" encoded with dictionary "dict".
  stream.write(Buffer.from([0x78, 0xBB, 0x04, 0x09, 0x01, 0xA5]));
}
