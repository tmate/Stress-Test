# Modules: Packages

<!-- type=misc -->

## Introduction

A package is a folder described by a `package.json` file.

A folder containing a `package.json` file, and all subfolders below that folder
until the next folder containing another `package.json` file, are a _package
scope_.

## Determining module system

Node.js will treat the following as [ES modules][] when passed to `node` as the
initial input, or when referenced by `import` statements within ES module code:

* Files ending in `.mjs`.

* Files ending in `.js` when the nearest parent `package.json` file contains a
  top-level field `"type"` with a value of `"module"`.

* Strings passed in as an argument to `--eval`, or piped to `node` via `STDIN`,
  with the flag `--input-type=module`.

Node.js will treat as [CommonJS][] all other forms of input, such as `.js` files
where the nearest parent `package.json` file contains no top-level `"type"`
field, or string input without the flag `--input-type`. This behavior is to
preserve backward compatibility. However, now that Node.js supports both
CommonJS and ES modules, it is best to be explicit whenever possible. Node.js
will treat the following as CommonJS when passed to `node` as the initial input,
or when referenced by `import` statements within ES module code:

* Files ending in `.cjs`.

* Files ending in `.js` when the nearest parent `package.json` file contains a
  top-level field `"type"` with a value of `"commonjs"`.

* Strings passed in as an argument to `--eval` or `--print`, or piped to `node`
  via `STDIN`, with the flag `--input-type=commonjs`.

### `package.json` `"type"` field

Files ending with `.js` will be loaded as [ES modules][] when the nearest parent
`package.json` file contains a top-level field `"type"` with a value of
`"module"`.

The nearest parent `package.json` is defined as the first `package.json` found
when searching in the current folder, that folder’s parent, and so on up
until the root of the volume is reached.

<!-- eslint-skip -->
```js
// package.json
{
  "type": "module"
}
```

```bash
# In same folder as preceding package.json
node my-app.js # Runs as ES module
```

If the nearest parent `package.json` lacks a `"type"` field, or contains
`"type": "commonjs"`, `.js` files are treated as [CommonJS][]. If the volume
root is reached and no `package.json` is found, Node.js defers to the default, a
`package.json` with no `"type"` field.

`import` statements of `.js` files are treated as ES modules if the nearest
parent `package.json` contains `"type": "module"`.

```js
// my-app.js, part of the same example as above
import './startup.js'; // Loaded as ES module because of package.json
```

Package authors should include the `"type"` field, even in packages where all
sources are [CommonJS][]. Being explicit about the `type` of the package will
future-proof the package in case the default type of Node.js ever changes, and
it will also make things easier for build tools and loaders to determine how the
files in the package should be interpreted.

Regardless of the value of the `"type"` field, `.mjs` files are always treated
as ES modules and `.cjs` files are always treated as [CommonJS][].

### Package scope and file extensions

A folder containing a `package.json` file, and all subfolders below that folder
until the next folder containing another `package.json`, are a
_package scope_. Package scopes do not carry through `node_modules` folders. The
`"type"` field defines how to treat `.js` files within the package scope. If a
`package.json` file does not have a `"type"` field, the default is `"commonjs"`.

The package scope applies not only to initial entry points (`node my-app.js`)
but also to files referenced by `import` statements and `import()` expressions.

```js
// my-app.js, in an ES module package scope because there is a package.json
// file in the same folder with "type": "module".

import './startup/init.js';
// Loaded as ES module since ./startup contains no package.json file,
// and therefore inherits the ES module package scope from one level up.

import 'commonjs-package';
// Loaded as CommonJS since ./node_modules/commonjs-package/package.json
// lacks a "type" field or contains "type": "commonjs".

import './node_modules/commonjs-package/index.js';
// Loaded as CommonJS since ./node_modules/commonjs-package/package.json
// lacks a "type" field or contains "type": "commonjs".
```

Files ending with `.mjs` are always loaded as [ES modules][] regardless of
package scope.

Files ending with `.cjs` are always loaded as [CommonJS][] regardless of package
scope.

```js
import './legacy-file.cjs';
// Loaded as CommonJS since .cjs is always loaded as CommonJS.

import 'commonjs-package/src/index.mjs';
// Loaded as ES module since .mjs is always loaded as ES module.
```

The `.mjs` and `.cjs` extensions may be used to mix types within the same
package scope:

* Within a `"type": "module"` package scope, Node.js can be instructed to
  interpret a particular file as [CommonJS][] by naming it with a `.cjs`
  extension (since both `.js` and `.mjs` files are treated as ES modules within
  a `"module"` package scope).

* Within a `"type": "commonjs"` package scope, Node.js can be instructed to
  interpret a particular file as an ES module by naming it with an `.mjs`
  extension (since both `.js` and `.cjs` files are treated as CommonJS within a
  `"commonjs"` package scope).

### `--input-type` flag

Strings passed in as an argument to `--eval` (or `-e`), or piped to `node` via
`STDIN`, will be treated as [ES modules][] when the `--input-type=module` flag
is set.

```bash
node --input-type=module --eval "import { sep } from 'path'; console.log(sep);"

echo "import { sep } from 'path'; console.log(sep);" | node --input-type=module
```

For completeness there is also `--input-type=commonjs`, for explicitly running
string input as CommonJS. This is the default behavior if `--input-type` is
unspecified.

## Package entry points

In a package’s `package.json` file, two fields can define entry points for a
package: `"main"` and `"exports"`. The `"main"` field is supported in all
versions of Node.js, but its capabilities are limited: it only defines the main
entry point of the package.

The `"exports"` field provides an alternative to `"main"` where the package
main entry point can be defined while also encapsulating the package,
**preventing any other entry points besides those defined in `"exports"`**.
This encapsulation allows module authors to define a public interface for
their package.

If both `"exports"` and `"main"` are defined, the `"exports"` field takes
precedence over `"main"`. `"exports"` are not specific to ES modules or
CommonJS; `"main"` will be overridden by `"exports"` if it exists. As such
`"main"` cannot be used as a fallback for CommonJS but it can be used as a
fallback for legacy versions of Node.js that do not support the `"exports"`
field.

[Conditional exports][] can be used within `"exports"` to define different
package entry points per environment, including whether the package is
referenced via `require` or via `import`. For more information about supporting
both CommonJS and ES Modules in a single package please consult
[the dual CommonJS/ES module packages section][].

**Warning**: Introducing the `"exports"` field prevents consumers of a package
from using any entry points that are not defined, including the `package.json`
(e.g. `require('your-package/package.json')`. **This will likely be a breaking
change.**

To make the introduction of `"exports"` non-breaking, ensure that every
previously supported entry point is exported. It is best to explicitly specify
entry points so that the package’s public API is well-defined. For example,
a project that previous exported `main`, `lib`,
`feature`, and the `package.json` could use the following `package.exports`:

```json
{
  "name": "my-mod",
  "exports": {
    ".": "./lib/index.js",
    "./lib": "./lib/index.js",
    "./lib/index": "./lib/index.js",
    "./lib/index.js": "./lib/index.js",
    "./feature": "./feature/index.js",
    "./feature/index.js": "./feature/index.js",
    "./package.json": "./package.json"
  }
}
```

Alternatively a project could choose to export entire folders:

```json
{
  "name": "my-mod",
  "exports": {
    ".": "./lib/index.js",
    "./lib": "./lib/index.js",
    "./lib/": "./lib/",
    "./feature": "./feature/index.js",
    "./feature/": "./feature/",
    "./package.json": "./package.json"
  }
}
```

As a last resort, package encapsulation can be disabled entirely by creating an
export for the root of the package `"./": "./"`. This will expose every file in
the package at the cost of disabling the encapsulation and potential tooling
benefits this provides. As the ES Module loader in Node.js enforces the use of
[the full specifier path][], exporting the root rather than being explicit
about entry is less expressive than either of the prior examples. Not only
will encapsulation be lost but module consumers will be unable to
`import feature from 'my-mod/feature'` as they will need to provide the full
path `import feature from 'my-mod/feature/index.js`.

### Main entry point export

To set the main entry point for a package, it is advisable to define both
`"exports"` and `"main"` in the package’s `package.json` file:

```json
{
  "main": "./main.js",
  "exports": "./main.js"
}
```

The benefit of doing this is that when using the `"exports"` field all
subpaths of the package will no longer be available to importers under
`require('pkg/subpath.js')`, and instead they will get a new error,
`ERR_PACKAGE_PATH_NOT_EXPORTED`.

This encapsulation of exports provides more reliable guarantees
about package interfaces for tools and when handling semver upgrades for a
package. It is not a strong encapsulation since a direct require of any
absolute subpath of the package such as
`require('/path/to/node_modules/pkg/subpath.js')` will still load `subpath.js`.

### Subpath exports

> Stability: 1 - Experimental

When using the `"exports"` field, custom subpaths can be defined along
with the main entry point by treating the main entry point as the
`"."` subpath:

```json
{
  "main": "./main.js",
  "exports": {
    ".": "./main.js",
    "./submodule": "./src/submodule.js"
  }
}
```

Now only the defined subpath in `"exports"` can be imported by a
consumer:

```js
import submodule from 'es-module-package/submodule';
// Loads ./node_modules/es-module-package/src/submodule.js
```

While other subpaths will error:

```js
import submodule from 'es-module-package/private-module.js';
// Throws ERR_PACKAGE_PATH_NOT_EXPORTED
```

Entire folders can also be mapped with package exports:

```json
// ./node_modules/es-module-package/package.json
{
  "exports": {
    "./features/": "./src/features/"
  }
}
```

With the preceding, all modules within the `./src/features/` folder
are exposed deeply to `import` and `require`:

```js
import feature from 'es-module-package/features/x.js';
// Loads ./node_modules/es-module-package/src/features/x.js
```

When using folder mappings, ensure that you do want to expose every
module inside the subfolder. Any modules which are not public
should be moved to another folder to retain the encapsulation
benefits of exports.

### Package exports fallbacks

> Stability: 1 - Experimental

For possible new specifier support in future, array fallbacks are
supported for all invalid specifiers:

```json
{
  "exports": {
    "./submodule": ["not:valid", "./submodule.js"]
  }
}
```

Since `"not:valid"` is not a valid specifier, `"./submodule.js"` is used
instead as the fallback, as if it were the only target.

### Exports sugar

> Stability: 1 - Experimental

If the `"."` export is the only export, the `"exports"` field provides sugar
for this case being the direct `"exports"` field value.

If the `"."` export has a fallback array or string value, then the `"exports"`
field can be set to this value directly.

```json
{
  "exports": {
    ".": "./main.js"
  }
}
```

can be written:

```json
{
  "exports": "./main.js"
}
```

### Conditional exports

> Stability: 1 - Experimental

Conditional exports provide a way to map to different paths depending on
certain conditions. They are supported for both CommonJS and ES module imports.

For example, a package that wants to provide different ES module exports for
`require()` and `import` can be written:

```json
// package.json
{
  "main": "./main-require.cjs",
  "exports": {
    "import": "./main-module.js",
    "require": "./main-require.cjs"
  },
  "type": "module"
}
```

Node.js supports the following conditions out of the box:

* `"import"` - matched when the package is loaded via `import` or
   `import()`. Can reference either an ES module or CommonJS file, as both
   `import` and `import()` can load either ES module or CommonJS sources.
   _Always matched when the `"require"` condition is not matched._
* `"require"` - matched when the package is loaded via `require()`.
   As `require()` only supports CommonJS, the referenced file must be CommonJS.
   _Always matched when the `"import"` condition is not matched._
* `"node"` - matched for any Node.js environment. Can be a CommonJS or ES
   module file. _This condition should always come after `"import"` or
   `"require"`._
* `"default"` - the generic fallback that will always match. Can be a CommonJS
   or ES module file. _This condition should always come last._

Within the `"exports"` object, key order is significant. During condition
matching, earlier entries have higher priority and take precedence over later
entries. _The general rule is that conditions should be from most specific to
least specific in object order_.

Other conditions such as `"browser"`, `"electron"`, `"deno"`, `"react-native"`,
etc. are unknown to, and thus ignored by Node.js. Runtimes or tools other than
Node.js may use them at their discretion. Further restrictions, definitions, or
guidance on condition names may occur in the future.

Using the `"import"` and `"require"` conditions can lead to some hazards,
which are further explained in [the dual CommonJS/ES module packages section][].

Conditional exports can also be extended to exports subpaths, for example:

```json
{
  "main": "./main.js",
  "exports": {
    ".": "./main.js",
    "./feature": {
      "node": "./feature-node.js",
      "default": "./feature.js"
    }
  }
}
```

Defines a package where `require('pkg/feature')` and `import 'pkg/feature'`
could provide different implementations between Node.js and other JS
environments.

When using environment branches, always include a `"default"` condition where
possible. Providing a `"default"` condition ensures that any unknown JS
environments are able to use this universal implementation, which helps avoid
these JS environments from having to pretend to be existing environments in
order to support packages with conditional exports. For this reason, using
`"node"` and `"default"` condition branches is usually preferable to using
`"node"` and `"browser"` condition branches.

### Nested conditions

> Stability: 1 - Experimental

In addition to direct mappings, Node.js also supports nested condition objects.

For example, to define a package that only has dual mode entry points for
use in Node.js but not the browser:

```json
{
  "main": "./main.js",
  "exports": {
    "node": {
      "import": "./feature-node.mjs",
      "require": "./feature-node.cjs"
    },
    "default": "./feature.mjs",
  }
}
```

Conditions continue to be matched in order as with flat conditions. If
a nested conditional does not have any mapping it will continue checking
the remaining conditions of the parent condition. In this way nested
conditions behave analogously to nested JavaScript `if` statements.

### Resolving user conditions

When running Node.js, custom user conditions can be added with the
`--conditions` flag:

```bash
node --conditions=development main.js
```

which would then resolve the `"development"` condition in package imports and
exports, while resolving the existing `"node"`, `"default"`, `"import"`, and
`"require"` conditions as appropriate.

Any number of custom conditions can be set with repeat flags.

### Self-referencing a package using its name

Within a package, the values defined in the package’s
`package.json` `"exports"` field can be referenced via the package’s name.
For example, assuming the `package.json` is:

```json
// package.json
{
  "name": "a-package",
  "exports": {
    ".": "./main.mjs",
    "./foo": "./foo.js"
  }
}
```

Then any module _in that package_ can reference an export in the package itself:

```js
// ./a-module.mjs
import { something } from 'a-package'; // Imports "something" from ./main.mjs.
```

Self-referencing is available only if `package.json` has `exports`, and will
allow importing only what that `exports` (in the `package.json`) allows.
So the code below, given the previous package, will generate a runtime error:

```js
// ./another-module.mjs

// Imports "another" from ./m.mjs. Fails because
// the "package.json" "exports" field
// does not provide an export named "./m.mjs".
import { another } from 'a-package/m.mjs';
```

Self-referencing is also available when using `require`, both in an ES module,
and in a CommonJS one. For example, this code will also work:

```js
// ./a-module.js
const { something } = require('a-package/foo'); // Loads from ./foo.js.
```

## Internal package imports

> Stability: 1 - Experimental

In addition to the `"exports"` field it is possible to define internal package
import maps that only apply to import specifiers from within the package itself.

Entries in the imports field must always start with `#` to ensure they are
clearly disambiguated from package specifiers.

For example, the imports field can be used to gain the benefits of conditional
exports for internal modules:

```json
// package.json
{
  "imports": {
    "#dep": {
      "node": "dep-node-native",
      "default": "./dep-polyfill.js"
    }
  },
  "dependencies": {
    "dep-node-native": "^1.0.0"
  }
}
```

where `import '#dep'` would now get the resolution of the external package
`dep-node-native` (including its exports in turn), and instead get the local
file `./dep-polyfill.js` relative to the package in other environments.

Unlike the exports field, import maps permit mapping to external packages
because this provides an important use case for conditional loading and also can
be done without the risk of cycles, unlike for exports.

Apart from the above, the resolution rules for the imports field are otherwise
analogous to the exports field.

## Dual CommonJS/ES module packages

Prior to the introduction of support for ES modules in Node.js, it was a common
pattern for package authors to include both CommonJS and ES module JavaScript
sources in their package, with `package.json` `"main"` specifying the CommonJS
entry point and `package.json` `"module"` specifying the ES module entry point.
This enabled Node.js to run the CommonJS entry point while build tools such as
bundlers used the ES module entry point, since Node.js ignored (and still
ignores) the top-level `"module"` field.

Node.js can now run ES module entry points, and a package can contain both
CommonJS and ES module entry points (either via separate specifiers such as
`'pkg'` and `'pkg/es-module'`, or both at the same specifier via [Conditional
exports][]). Unlike in the scenario where `"module"` is only used by bundlers,
or ES module files are transpiled into CommonJS on the fly before evaluation by
Node.js, the files referenced by the ES module entry point are evaluated as ES
modules.

### Dual package hazard

When an application is using a package that provides both CommonJS and ES module
sources, there is a risk of certain bugs if both versions of the package get
loaded. This potential comes from the fact that the `pkgInstance` created by
`const pkgInstance = require('pkg')` is not the same as the `pkgInstance`
created by `import pkgInstance from 'pkg'` (or an alternative main path like
`'pkg/module'`). This is the “dual package hazard,” where two versions of the
same package can be loaded within the same runtime environment. While it is
unlikely that an application or package would intentionally load both versions
directly, it is common for an application to load one version while a dependency
of the application loads the other version. This hazard can happen because
Node.js supports intermixing CommonJS and ES modules, and can lead to unexpected
behavior.

If the package main export is a constructor, an `instanceof` comparison of
instances created by the two versions returns `false`, and if the export is an
object, properties added to one (like `pkgInstance.foo = 3`) are not present on
the other. This differs from how `import` and `require` statements work in
all-CommonJS or all-ES module environments, respectively, and therefore is
surprising to users. It also differs from the behavior users are familiar with
when using transpilation via tools like [Babel][] or [`esm`][].

### Writing dual packages while avoiding or minimizing hazards

First, the hazard described in the previous section occurs when a package
contains both CommonJS and ES module sources and both sources are provided for
use in Node.js, either via separate main entry points or exported paths. A
package could instead be written where any version of Node.js receives only
CommonJS sources, and any separate ES module sources the package may contain
could be intended only for other environments such as browsers. Such a package
would be usable by any version of Node.js, since `import` can refer to CommonJS
files; but it would not provide any of the advantages of using ES module syntax.

A package could also switch from CommonJS to ES module syntax in a breaking
change version bump. This has the disadvantage that the newest version
of the package would only be usable in ES module-supporting versions of Node.js.

Every pattern has tradeoffs, but there are two broad approaches that satisfy the
following conditions:

1. The package is usable via both `require` and `import`.
1. The package is usable in both current Node.js and older versions of Node.js
   that lack support for ES modules.
1. The package main entry point, e.g. `'pkg'` can be used by both `require` to
   resolve to a CommonJS file and by `import` to resolve to an ES module file.
   (And likewise for exported paths, e.g. `'pkg/feature'`.)
1. The package provides named exports, e.g. `import { name } from 'pkg'` rather
   than `import pkg from 'pkg'; pkg.name`.
1. The package is potentially usable in other ES module environments such as
   browsers.
1. The hazards described in the previous section are avoided or minimized.

#### Approach #1: Use an ES module wrapper

Write the package in CommonJS or transpile ES module sources into CommonJS, and
create an ES module wrapper file that defines the named exports. Using
[Conditional exports][], the ES module wrapper is used for `import` and the
CommonJS entry point for `require`.

```json
// ./node_modules/pkg/package.json
{
  "type": "module",
  "main": "./index.cjs",
  "exports": {
    "import": "./wrapper.mjs",
    "require": "./index.cjs"
  }
}
```

The preceding example uses explicit extensions `.mjs` and `.cjs`.
If your files use the `.js` extension, `"type": "module"` will cause such files
to be treated as ES modules, just as `"type": "commonjs"` would cause them
to be treated as CommonJS.
See [Enabling](#esm_enabling).

```js
// ./node_modules/pkg/index.cjs
exports.name = 'value';
```

```js
// ./node_modules/pkg/wrapper.mjs
import cjsModule from './index.cjs';
export const name = cjsModule.name;
```

In this example, the `name` from `import { name } from 'pkg'` is the same
singleton as the `name` from `const { name } = require('pkg')`. Therefore `===`
returns `true` when comparing the two `name`s and the divergent specifier hazard
is avoided.

If the module is not simply a list of named exports, but rather contains a
unique function or object export like `module.exports = function () { ... }`,
or if support in the wrapper for the `import pkg from 'pkg'` pattern is desired,
then the wrapper would instead be written to export the default optionally
along with any named exports as well:

```js
import cjsModule from './index.cjs';
export const name = cjsModule.name;
export default cjsModule;
```

This approach is appropriate for any of the following use cases:
* The package is currently written in CommonJS and the author would prefer not
  to refactor it into ES module syntax, but wishes to provide named exports for
  ES module consumers.
* The package has other packages that depend on it, and the end user might
  install both this package and those other packages. For example a `utilities`
  package is used directly in an application, and a `utilities-plus` package
  adds a few more functions to `utilities`. Because the wrapper exports
  underlying CommonJS files, it doesn’t matter if `utilities-plus` is written in
  CommonJS or ES module syntax; it will work either way.
* The package stores internal state, and the package author would prefer not to
  refactor the package to isolate its state management. See the next section.

A variant of this approach not requiring conditional exports for consumers could
be to add an export, e.g. `"./module"`, to point to an all-ES module-syntax
version of the package. This could be used via `import 'pkg/module'` by users
who are certain that the CommonJS version will not be loaded anywhere in the
application, such as by dependencies; or if the CommonJS version can be loaded
but doesn’t affect the ES module version (for example, because the package is
stateless):

```json
// ./node_modules/pkg/package.json
{
  "type": "module",
  "main": "./index.cjs",
  "exports": {
    ".": "./index.cjs",
    "./module": "./wrapper.mjs"
  }
}
```

#### Approach #2: Isolate state

A `package.json` file can define the separate CommonJS and ES module entry
points directly:

```json
// ./node_modules/pkg/package.json
{
  "type": "module",
  "main": "./index.cjs",
  "exports": {
    "import": "./index.mjs",
    "require": "./index.cjs"
  }
}
```

This can be done if both the CommonJS and ES module versions of the package are
equivalent, for example because one is the transpiled output of the other; and
the package’s management of state is carefully isolated (or the package is
stateless).

The reason that state is an issue is because both the CommonJS and ES module
versions of the package may get used within an application; for example, the
user’s application code could `import` the ES module version while a dependency
`require`s the CommonJS version. If that were to occur, two copies of the
package would be loaded in memory and therefore two separate states would be
present. This would likely cause hard-to-troubleshoot bugs.

Aside from writing a stateless package (if JavaScript’s `Math` were a package,
for example, it would be stateless as all of its methods are static), there are
some ways to isolate state so that it’s shared between the potentially loaded
CommonJS and ES module instances of the package:

1. If possible, contain all state within an instantiated object. JavaScript’s
   `Date`, for example, needs to be instantiated to contain state; if it were a
   package, it would be used like this:

    ```js
    import Date from 'date';
    const someDate = new Date();
    // someDate contains state; Date does not
    ```

   The `new` keyword isn’t required; a package’s function can return a new
   object, or modify a passed-in object, to keep the state external to the
   package.

1. Isolate the state in one or more CommonJS files that are shared between the
   CommonJS and ES module versions of the package. For example, if the CommonJS
   and ES module entry points are `index.cjs` and `index.mjs`, respectively:

    ```js
    // ./node_modules/pkg/index.cjs
    const state = require('./state.cjs');
    module.exports.state = state;
    ```

    ```js
    // ./node_modules/pkg/index.mjs
    import state from './state.cjs';
    export {
      state
    };
    ```

   Even if `pkg` is used via both `require` and `import` in an application (for
   example, via `import` in application code and via `require` by a dependency)
   each reference of `pkg` will contain the same state; and modifying that
   state from either module system will apply to both.

Any plugins that attach to the package’s singleton would need to separately
attach to both the CommonJS and ES module singletons.

This approach is appropriate for any of the following use cases:
* The package is currently written in ES module syntax and the package author
  wants that version to be used wherever such syntax is supported.
* The package is stateless or its state can be isolated without too much
  difficulty.
* The package is unlikely to have other public packages that depend on it, or if
  it does, the package is stateless or has state that need not be shared between
  dependencies or with the overall application.

Even with isolated state, there is still the cost of possible extra code
execution between the CommonJS and ES module versions of a package.

As with the previous approach, a variant of this approach not requiring
conditional exports for consumers could be to add an export, e.g.
`"./module"`, to point to an all-ES module-syntax version of the package:

```json
// ./node_modules/pkg/package.json
{
  "type": "module",
  "main": "./index.cjs",
  "exports": {
    ".": "./index.cjs",
    "./module": "./index.mjs"
  }
}
```

[Conditional exports]: #packages_conditional_exports
[Babel]: https://babeljs.io/
[`esm`]: https://github.com/standard-things/esm#readme
[the full specifier path]: modules_esm.html#modules_esm_mandatory_file_extensions
[the dual CommonJS/ES module packages section]: #packages_dual_commonjs_es_module_packages
[ES modules]: esm.html
[CommonJS]: modules.html
