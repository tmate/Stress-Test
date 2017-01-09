'use strict';
const common = require('../common');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

if (!common.isWindows) {
  common.skip('this test is Windows-specific.');
  return;
}

// make a path that will be at least 260 chars long.
var fileNameLen = Math.max(260 - common.tmpDir.length - 1, 1);
var fileName = path.join(common.tmpDir, new Array(fileNameLen + 1).join('x'));
var fullPath = path.resolve(fileName);

common.refreshTmpDir();

console.log({
  filenameLength: fileName.length,
  fullPathLength: fullPath.length
});

fs.writeFile(fullPath, 'ok', common.mustCall(function(err) {
  assert.ifError(err);

  fs.stat(fullPath, common.mustCall(function(err, stats) {
    assert.ifError(err);
  }));
}));

process.on('exit', function() {
  fs.unlinkSync(fullPath);
});
