// Flags: --experimental-report
'use strict';

// Test producing a report via API call, using the no-hooks/no-signal interface.
const common = require('../common');
common.skipIfReportDisabled();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const helper = require('../common/report');
const tmpdir = require('../common/tmpdir');

common.expectWarning('ExperimentalWarning',
                     'report is an experimental feature. This feature could ' +
                     'change at any time');
tmpdir.refresh();
process.report.setOptions({ path: tmpdir.path });

function validate() {
  const reports = helper.findReports(process.pid, tmpdir.path);
  assert.strictEqual(reports.length, 1);
  helper.validate(reports[0]);
  fs.unlinkSync(reports[0]);
  return reports[0];
}

{
  // Test with no arguments.
  process.report.triggerReport();
  validate();
}

{
  // Test with an error argument.
  process.report.triggerReport(new Error('test error'));
  validate();
}

{
  // Test with a file argument.
  const file = process.report.triggerReport('custom-name-1.json');
  const absolutePath = path.join(tmpdir.path, file);
  assert.strictEqual(helper.findReports(process.pid, tmpdir.path).length, 0);
  assert.strictEqual(file, 'custom-name-1.json');
  helper.validate(absolutePath);
  fs.unlinkSync(absolutePath);
}

{
  // Test with file and error arguments.
  const file = process.report.triggerReport('custom-name-2.json',
                                            new Error('test error'));
  const absolutePath = path.join(tmpdir.path, file);
  assert.strictEqual(helper.findReports(process.pid, tmpdir.path).length, 0);
  assert.strictEqual(file, 'custom-name-2.json');
  helper.validate(absolutePath);
  fs.unlinkSync(absolutePath);
}

{
  // Test with a filename option.
  const filename = path.join(tmpdir.path, 'custom-name-3.json');
  process.report.setOptions({ filename });
  const file = process.report.triggerReport();
  assert.strictEqual(helper.findReports(process.pid, tmpdir.path).length, 0);
  assert.strictEqual(file, filename);
  helper.validate(filename);
  fs.unlinkSync(filename);
}
