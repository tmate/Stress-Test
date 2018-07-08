'use strict';

const common = require('../common.js');
const assert = require('assert');

const groupedInputs = {
  group_common: ['undefined', 'utf8', 'utf-8', 'base64',
                 'binary', 'latin1', 'ucs-2', 'usc-2'],
  group_upper: ['UTF-8', 'UTF8', 'UCS2', 'UTF-16LE',
                'UTF16LE', 'BASE64', 'UCS-2', 'USC-2'],
  group_uncommon: ['foo', '1', 'false', 'undefined', '[]', '{}'],
  group_misc: ['', 'utf16le', 'usc2', 'hex', 'HEX', 'BINARY']
};

const inputs = [
  '',
  'utf8', 'utf-8', 'UTF-8',
  'UTF8', 'Utf8', 'uTf-8', 'utF-8',
  'ucs2', 'UCS2', 'UcS2',
  'USC2', 'usc2', 'uSc2',
  'ucs-2', 'UCS-2', 'UcS-2',
  'usc-2', 'USC-2', 'uSc-2',
  'utf16le', 'utf-16le', 'UTF-16LE', 'UTF16LE',
  'binary', 'BINARY', 'latin1', 'base64', 'BASE64',
  'hex', 'HEX', 'foo', '1', 'false', 'undefined', '[]', '{}'];

const bench = common.createBenchmark(main, {
  input: inputs.concat(Object.keys(groupedInputs)),
  n: [1e7]
}, {
  flags: '--expose-internals'
});

function getInput(input) {
  switch (input) {
    case 'group_common':
      return groupedInputs.group_common;
    case 'group_upper':
      return groupedInputs.group_upper;
    case 'group_uncommon':
      return groupedInputs.group_uncommon;
    case 'group_misc':
      return groupedInputs.group_misc;
    case '1':
      return [1];
    case 'false':
      return [false];
    case 'undefined':
      return [undefined];
    case '[]':
      return [[]];
    case '{}':
      return [{}];
    default:
      return [input];
  }
}

function main({ input, n }) {
  const { normalizeEncoding } = require('internal/util');
  const inputs = getInput(input);
  var noDead = '';

  bench.start();
  for (var i = 0; i < n; ++i) {
    for (var j = 0; j < inputs.length; ++j) {
      noDead = normalizeEncoding(inputs[j]);
    }
  }
  bench.end(n);
  assert.ok(noDead === undefined || noDead.length > 0);
}
