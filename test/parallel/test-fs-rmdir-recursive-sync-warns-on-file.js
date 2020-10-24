'use strict';
const common = require('../common');
const tmpdir = require('../common/tmpdir');
const fs = require('fs');
const path = require('path');

tmpdir.refresh();

{
  // Should warn when trying to delete a file
  common.expectWarning(
    'DeprecationWarning',
    'In future versions of Node.js, fs.rmdir(path, { recursive: true }) ' +
    'will throw if path does not exist or is a file. Use fs.rm(path, ' +
    '{ recursive: true, force: true }) instead',
    'DEP0147'
  );
  const filePath = path.join(tmpdir.path, 'rmdir-recursive.txt');
  fs.writeFileSync(filePath, '');
  fs.rmdirSync(filePath, { recursive: true });
}
