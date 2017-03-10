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

'use strict';

const common = require('../common');
const assert = require('assert');
const spawn = require('child_process').spawn;
const os = require('os');
const path = require('path');

const port = common.PORT;
const serverPath = path.join(common.fixturesDir, 'clustered-server', 'app.js');
// cannot use 'Flags: --no-deprecation' since it doesn't effect child
const args = [`--debug-port=${port}`, '--no-deprecation', serverPath];
const options = { stdio: ['inherit', 'inherit', 'pipe', 'ipc'] };
const child = spawn(process.execPath, args, options);

let expectedContent = [
  'Starting debugger agent.',
  'Debugger listening on 127.0.0.1:' + (port + 0),
  'Starting debugger agent.',
  'Debugger listening on 127.0.0.1:' + (port + 1),
  'Starting debugger agent.',
  'Debugger listening on 127.0.0.1:' + (port + 2),
].join(os.EOL);
expectedContent += os.EOL; // the last line also contains an EOL character

let debuggerAgentsOutput = '';
let debuggerAgentsStarted = false;

let pids;

child.stderr.on('data', function(data) {
  const childStderrOutputString = data.toString();
  const lines = childStderrOutputString.replace(/\r/g, '').trim().split('\n');

  lines.forEach(function(line) {
    console.log('> ' + line);

    if (line === 'all workers are running') {
      child.on('message', function(msg) {
        if (msg.type !== 'pids')
          return;

        pids = msg.pids;
        console.error('got pids %j', pids);

        process._debugProcess(child.pid);
        debuggerAgentsStarted = true;
      });

      child.send({
        type: 'getpids'
      });
    }
  });

  if (debuggerAgentsStarted) {
    debuggerAgentsOutput += childStderrOutputString;
    if (debuggerAgentsOutput.length === expectedContent.length) {
      onNoMoreDebuggerAgentsOutput();
    }
  }
});

function onNoMoreDebuggerAgentsOutput() {
  assertDebuggerAgentsOutput();
  process.exit();
}

process.on('exit', function onExit() {
  // Kill processes in reverse order to avoid timing problems on Windows where
  // the parent process is killed before the children.
  pids.reverse().forEach(function(pid) {
    process.kill(pid);
  });
});

function assertDebuggerAgentsOutput() {
  // Workers can take different amout of time to start up, and child processes'
  // output may be interleaved arbitrarily. Moreover, child processes' output
  // may be written using an arbitrary number of system calls, and no assumption
  // on buffering or atomicity of output should be made. Thus, we process the
  // output of all child processes' debugger agents character by character, and
  // remove each character from the set of expected characters. Once all the
  // output from all debugger agents has been processed, we consider that we got
  // the content we expected if there's no character left in the initial
  // expected content.
  debuggerAgentsOutput.split('').forEach(function gotChar(char) {
    expectedContent = expectedContent.replace(char, '');
  });

  assert.strictEqual(expectedContent, '');
}
