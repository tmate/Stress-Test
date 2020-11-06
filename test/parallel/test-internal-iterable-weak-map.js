// Flags: --expose-gc --expose-internals
'use strict';

require('../common');
const { deepStrictEqual, strictEqual } = require('assert');
const { IterableWeakMap } = require('internal/util/iterable_weak_map');

// It drops entry if a reference is no longer held.
{
  const wm = new IterableWeakMap();
  const _cache = {
    moduleA: {},
    moduleB: {},
    moduleC: {},
  };
  wm.set(_cache.moduleA, 'hello');
  wm.set(_cache.moduleB, 'discard');
  wm.set(_cache.moduleC, 'goodbye');
  delete _cache.moduleB;
  setImmediate(() => {
    _cache;
    globalThis.gc();
    const values = [...wm];
    deepStrictEqual(values, ['hello', 'goodbye']);
  });
}

// It updates an existing entry, if the same key is provided twice.
{
  const wm = new IterableWeakMap();
  const _cache = {
    moduleA: {},
    moduleB: {},
  };
  wm.set(_cache.moduleA, 'hello');
  wm.set(_cache.moduleB, 'goodbye');
  wm.set(_cache.moduleB, 'goodnight');
  const values = [...wm];
  deepStrictEqual(values, ['hello', 'goodnight']);
}

// It allows entry to be deleted by key.
{
  const wm = new IterableWeakMap();
  const _cache = {
    moduleA: {},
    moduleB: {},
    moduleC: {},
  };
  wm.set(_cache.moduleA, 'hello');
  wm.set(_cache.moduleB, 'discard');
  wm.set(_cache.moduleC, 'goodbye');
  wm.delete(_cache.moduleB);
  const values = [...wm];
  deepStrictEqual(values, ['hello', 'goodbye']);
}

// It handles delete for key that does not exist.
{
  const wm = new IterableWeakMap();
  const _cache = {
    moduleA: {},
    moduleB: {},
    moduleC: {},
  };
  wm.set(_cache.moduleA, 'hello');
  wm.set(_cache.moduleC, 'goodbye');
  wm.delete(_cache.moduleB);
  const values = [...wm];
  deepStrictEqual(values, ['hello', 'goodbye']);
}

// It allows an entry to be fetched by key.
{
  const wm = new IterableWeakMap();
  const _cache = {
    moduleA: {},
    moduleB: {},
    moduleC: {},
  };
  wm.set(_cache.moduleA, 'hello');
  wm.set(_cache.moduleB, 'discard');
  wm.set(_cache.moduleC, 'goodbye');
  strictEqual(wm.get(_cache.moduleB), 'discard');
}

// It returns true for has() if key exists.
{
  const wm = new IterableWeakMap();
  const _cache = {
    moduleA: {},
  };
  wm.set(_cache.moduleA, 'hello');
  strictEqual(wm.has(_cache.moduleA), true);
}
