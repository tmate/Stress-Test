'use strict';

// This code triggers an AssertionError on Linux in Node.js 5.3.0 and earlier.
// Ref: https://github.com/nodejs/node/issues/4205

const common = require('../common');
const assert = require('assert');
const net = require('net');
const cluster = require('cluster');
cluster.schedulingPolicy = cluster.SCHED_NONE;

if (cluster.isMaster) {
  var worker1, worker2;

  worker1 = cluster.fork();
  worker1.on('message', common.mustCall(function() {
    worker2 = cluster.fork();
    worker1.disconnect();
    worker2.on('online', common.mustCall(worker2.disconnect));
  }));

  cluster.on('exit', function(worker, code) {
    assert.strictEqual(code, 0, 'worker exited with error');
  });

  return;
}

var server = net.createServer();

server.listen(common.PORT, function() {
  process.send('listening');
});
