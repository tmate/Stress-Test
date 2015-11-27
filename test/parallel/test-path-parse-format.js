'use strict';
require('../common');
const assert = require('assert');
const path = require('path');

const winPaths = [
  'C:\\path\\dir\\index.html',
  'C:\\another_path\\DIR\\1\\2\\33\\\\index',
  'another_path\\DIR with spaces\\1\\2\\33\\index',
  '\\foo\\C:',
  'file',
  '.\\file',
  'C:\\',
  '',

  // unc
  '\\\\server\\share\\file_path',
  '\\\\server two\\shared folder\\file path.zip',
  '\\\\teela\\admin$\\system32',
  '\\\\?\\UNC\\server\\share'
];

const winSpecialCaseFormatTests = [
  [{dir: 'some\\dir'}, 'some\\dir\\'],
  [{base: 'index.html'}, 'index.html'],
  [{root: 'C:\\'}, 'C:\\'],
  [{name: 'index', ext: '.html'}, 'index.html'],
  [{dir: 'some\\dir', name: 'index', ext: '.html'}, 'some\\dir\\index.html'],
  [{root: 'C:\\', name: 'index', ext: '.html'}, 'C:\\index.html'],
  [{}, '']
];

const unixPaths = [
  '/home/user/dir/file.txt',
  '/home/user/a dir/another File.zip',
  '/home/user/a dir//another&File.',
  '/home/user/a$$$dir//another File.zip',
  'user/dir/another File.zip',
  'file',
  '.\\file',
  './file',
  'C:\\foo',
  '/',
  ''
];

const unixSpecialCaseFormatTests = [
  [{dir: 'some/dir'}, 'some/dir/'],
  [{base: 'index.html'}, 'index.html'],
  [{root: '/'}, '/'],
  [{name: 'index', ext: '.html'}, 'index.html'],
  [{dir: 'some/dir', name: 'index', ext: '.html'}, 'some/dir/index.html'],
  [{root: '/', name: 'index', ext: '.html'}, '/index.html'],
  [{}, '']
];

const errors = [
  {method: 'parse', input: [null],
   message: /Path must be a string. Received null/},
  {method: 'parse', input: [{}],
   message: /Path must be a string. Received {}/},
  {method: 'parse', input: [true],
   message: /Path must be a string. Received true/},
  {method: 'parse', input: [1],
   message: /Path must be a string. Received 1/},
  {method: 'parse', input: [],
   message: /Path must be a string. Received undefined/},
  {method: 'format', input: [null],
   message: /Parameter "pathObject" must be an object, not/},
  {method: 'format', input: [''],
   message: /Parameter "pathObject" must be an object, not string/},
  {method: 'format', input: [true],
   message: /Parameter "pathObject" must be an object, not boolean/},
  {method: 'format', input: [1],
   message: /Parameter "pathObject" must be an object, not number/},
];

checkParseFormat(path.win32, winPaths);
checkParseFormat(path.posix, unixPaths);
checkErrors(path.win32);
checkErrors(path.posix);
checkFormat(path.win32, winSpecialCaseFormatTests);
checkFormat(path.posix, unixSpecialCaseFormatTests);

function checkErrors(path) {
  errors.forEach(function(errorCase) {
    try {
      path[errorCase.method].apply(path, errorCase.input);
    } catch(err) {
      assert.ok(err instanceof TypeError);
      assert.ok(
        errorCase.message.test(err.message),
        'expected ' + errorCase.message + ' to match ' + err.message
      );
      return;
    }

    assert.fail(null, null, 'should have thrown');
  });
}

function checkParseFormat(path, paths) {
  paths.forEach(function(element) {
    var output = path.parse(element);
    assert.strictEqual(typeof output.root, 'string');
    assert.strictEqual(typeof output.dir, 'string');
    assert.strictEqual(typeof output.base, 'string');
    assert.strictEqual(typeof output.ext, 'string');
    assert.strictEqual(typeof output.name, 'string');
    assert.strictEqual(path.format(output), element);
    assert.strictEqual(output.dir, output.dir ? path.dirname(element) : '');
    assert.strictEqual(output.base, path.basename(element));
    assert.strictEqual(output.ext, path.extname(element));
  });
}

function checkFormat(path, testCases) {
  testCases.forEach(function(testCase) {
    assert.strictEqual(path.format(testCase[0]), testCase[1]);
  });
}
