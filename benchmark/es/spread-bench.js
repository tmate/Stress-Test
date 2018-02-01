'use strict';

const common = require('../common.js');
const assert = require('assert');

const bench = common.createBenchmark(main, {
  method: ['apply', 'spread', 'call-spread'],
  count: [5, 10, 20],
  context: ['context', 'null'],
  rest: [0, 1],
  millions: [5]
});

function makeTest(count, rest) {
  if (rest) {
    return function test(...args) {
      assert.strictEqual(count, args.length);
    };
  } else {
    return function test() {
      assert.strictEqual(count, arguments.length);
    };
  }
}

function main({ millions, context, count, rest, method }) {
  const ctx = context === 'context' ? {} : null;
  var fn = makeTest(count, rest);
  const args = new Array(count);
  var i;
  for (i = 0; i < count; i++)
    args[i] = i;

  switch (method) {
    case '':
      // Empty string falls through to next line as default, mostly for tests.
    case 'apply':
      bench.start();
      for (i = 0; i < millions * 1e6; i++)
        fn.apply(ctx, args);
      bench.end(millions);
      break;
    case 'spread':
      if (ctx !== null)
        fn = fn.bind(ctx);
      bench.start();
      for (i = 0; i < millions * 1e6; i++)
        fn(...args);
      bench.end(millions);
      break;
    case 'call-spread':
      bench.start();
      for (i = 0; i < millions * 1e6; i++)
        fn.call(ctx, ...args);
      bench.end(millions);
      break;
    default:
      throw new Error(`Unexpected method "${method}"`);
  }
}
