'use strict';

require('../common');
const { WPTRunner } = require('../common/wpt');

const runner = new WPTRunner('url');

runner.pretendGlobalThisAs('Window');
runner.runJsTests();
