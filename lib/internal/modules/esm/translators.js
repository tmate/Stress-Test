'use strict';

/* global WebAssembly */

const {
  JSONParse,
  ObjectKeys,
  PromisePrototypeCatch,
  PromiseReject,
  SafeMap,
  StringPrototypeReplace,
} = primordials;

const assert = require('internal/assert');

let _TYPES = null;
function lazyTypes() {
  if (_TYPES !== null) return _TYPES;
  return _TYPES = require('internal/util/types');
}

const {
  stripBOM,
  loadNativeModule
} = require('internal/modules/cjs/helpers');
const CJSModule = require('internal/modules/cjs/loader').Module;
const internalURLModule = require('internal/url');
const { defaultGetSource } = require(
  'internal/modules/esm/get_source');
const { defaultTransformSource } = require(
  'internal/modules/esm/transform_source');
const createDynamicModule = require(
  'internal/modules/esm/create_dynamic_module');
const { fileURLToPath, URL } = require('url');
let debug = require('internal/util/debuglog').debuglog('esm', (fn) => {
  debug = fn;
});
const { emitExperimentalWarning } = require('internal/util');
const {
  ERR_UNKNOWN_BUILTIN_MODULE,
  ERR_INVALID_RETURN_PROPERTY_VALUE
} = require('internal/errors').codes;
const { maybeCacheSourceMap } = require('internal/source_map/source_map_cache');
const moduleWrap = internalBinding('module_wrap');
const { ModuleWrap } = moduleWrap;
const { getOptionValue } = require('internal/options');
const experimentalImportMetaResolve =
    getOptionValue('--experimental-import-meta-resolve');

const translators = new SafeMap();
exports.translators = translators;

let DECODER = null;
function assertBufferSource(body, allowString, hookName) {
  if (allowString && typeof body === 'string') {
    return;
  }
  const { isArrayBufferView, isAnyArrayBuffer } = lazyTypes();
  if (isArrayBufferView(body) || isAnyArrayBuffer(body)) {
    return;
  }
  throw new ERR_INVALID_RETURN_PROPERTY_VALUE(
    `${allowString ? 'string, ' : ''}array buffer, or typed array`,
    hookName,
    'source',
    body
  );
}

function stringify(body) {
  if (typeof body === 'string') return body;
  assertBufferSource(body, false, 'transformSource');
  DECODER = DECODER === null ? new TextDecoder() : DECODER;
  return DECODER.decode(body);
}

function errPath(url) {
  const parsed = new URL(url);
  if (parsed.protocol === 'file:') {
    return fileURLToPath(parsed);
  }
  return url;
}

let esmLoader;
async function importModuleDynamically(specifier, { url }) {
  if (!esmLoader) {
    esmLoader = require('internal/process/esm_loader').ESMLoader;
  }
  return esmLoader.import(specifier, url);
}

function createImportMetaResolve(defaultParentUrl) {
  return async function resolve(specifier, parentUrl = defaultParentUrl) {
    if (!esmLoader) {
      esmLoader = require('internal/process/esm_loader').ESMLoader;
    }
    return PromisePrototypeCatch(
      esmLoader.resolve(specifier, parentUrl),
      (error) => (
        error.code === 'ERR_UNSUPPORTED_DIR_IMPORT' ?
          error.url : PromiseReject(error))
    );
  };
}

function initializeImportMeta(meta, { url }) {
  // Alphabetical
  if (experimentalImportMetaResolve)
    meta.resolve = createImportMetaResolve(url);
  meta.url = url;
}

// Strategy for loading a standard JavaScript module
translators.set('module', async function moduleStrategy(url) {
  let { source } = await this._getSource(
    url, { format: 'module' }, defaultGetSource);
  assertBufferSource(source, true, 'getSource');
  ({ source } = await this._transformSource(
    source, { url, format: 'module' }, defaultTransformSource));
  source = stringify(source);
  maybeCacheSourceMap(url, source);
  debug(`Translating StandardModule ${url}`);
  const module = new ModuleWrap(url, undefined, source, 0, 0);
  moduleWrap.callbackMap.set(module, {
    initializeImportMeta,
    importModuleDynamically,
  });
  return module;
});

// Strategy for loading a node-style CommonJS module
const isWindows = process.platform === 'win32';
const winSepRegEx = /\//g;
translators.set('commonjs', function commonjsStrategy(url, isMain) {
  debug(`Translating CJSModule ${url}`);
  let filename = internalURLModule.fileURLToPath(new URL(url));
  if (isWindows)
    filename = StringPrototypeReplace(filename, winSepRegEx, '\\');
  return new ModuleWrap(url, undefined, ['default'], function() {
    debug(`Loading CJSModule ${url}`);
    let module = CJSModule._cache[filename];
    if (!module || !module.loaded) {
      module = new CJSModule(filename);
      module.filename = filename;
      module.paths = CJSModule._nodeModulePaths(module.path);
      CJSModule._cache[filename] = module;
      module.load(filename);
      assert(module && module.loaded);
    }
    this.setExport('default', module.exports);
  });
});

// Strategy for loading a node builtin CommonJS module that isn't
// through normal resolution
translators.set('builtin', async function builtinStrategy(url) {
  debug(`Translating BuiltinModule ${url}`);
  // Slice 'nodejs:' scheme
  const id = url.slice(7);
  const module = loadNativeModule(id, url, true);
  if (!url.startsWith('nodejs:') || !module) {
    throw new ERR_UNKNOWN_BUILTIN_MODULE(id);
  }
  debug(`Loading BuiltinModule ${url}`);
  return module.getESMFacade();
});

// Strategy for loading a JSON file
translators.set('json', async function jsonStrategy(url) {
  emitExperimentalWarning('Importing JSON modules');
  debug(`Translating JSONModule ${url}`);
  debug(`Loading JSONModule ${url}`);
  const pathname = url.startsWith('file:') ? fileURLToPath(url) : null;
  let modulePath;
  let module;
  if (pathname) {
    modulePath = isWindows ?
      StringPrototypeReplace(pathname, winSepRegEx, '\\') : pathname;
    module = CJSModule._cache[modulePath];
    if (module && module.loaded) {
      const exports = module.exports;
      return new ModuleWrap(url, undefined, ['default'], function() {
        this.setExport('default', exports);
      });
    }
  }
  let { source } = await this._getSource(
    url, { format: 'json' }, defaultGetSource);
  assertBufferSource(source, true, 'getSource');
  ({ source } = await this._transformSource(
    source, { url, format: 'json' }, defaultTransformSource));
  source = stringify(source);
  if (pathname) {
    // A require call could have been called on the same file during loading and
    // that resolves synchronously. To make sure we always return the identical
    // export, we have to check again if the module already exists or not.
    module = CJSModule._cache[modulePath];
    if (module && module.loaded) {
      const exports = module.exports;
      return new ModuleWrap(url, undefined, ['default'], function() {
        this.setExport('default', exports);
      });
    }
  }
  try {
    const exports = JSONParse(stripBOM(source));
    module = {
      exports,
      loaded: true
    };
  } catch (err) {
    // TODO (BridgeAR): We could add a NodeCore error that wraps the JSON
    // parse error instead of just manipulating the original error message.
    // That would allow to add further properties and maybe additional
    // debugging information.
    err.message = errPath(url) + ': ' + err.message;
    throw err;
  }
  if (pathname) {
    CJSModule._cache[modulePath] = module;
  }
  return new ModuleWrap(url, undefined, ['default'], function() {
    debug(`Parsing JSONModule ${url}`);
    this.setExport('default', module.exports);
  });
});

// Strategy for loading a wasm module
translators.set('wasm', async function(url) {
  emitExperimentalWarning('Importing Web Assembly modules');
  let { source } = await this._getSource(
    url, { format: 'wasm' }, defaultGetSource);
  assertBufferSource(source, false, 'getSource');
  ({ source } = await this._transformSource(
    source, { url, format: 'wasm' }, defaultTransformSource));
  assertBufferSource(source, false, 'transformSource');
  debug(`Translating WASMModule ${url}`);
  let compiled;
  try {
    compiled = await WebAssembly.compile(source);
  } catch (err) {
    err.message = errPath(url) + ': ' + err.message;
    throw err;
  }

  const imports =
      WebAssembly.Module.imports(compiled).map(({ module }) => module);
  const exports = WebAssembly.Module.exports(compiled).map(({ name }) => name);

  return createDynamicModule(imports, exports, url, (reflect) => {
    const { exports } = new WebAssembly.Instance(compiled, reflect.imports);
    for (const expt of ObjectKeys(exports))
      reflect.exports[expt].set(exports[expt]);
  }).module;
});
