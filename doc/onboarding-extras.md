# Additional Onboarding Information

## Who to CC in issues

| Subsystem                                | Maintainers                                                           |
| ---                                      | ---                                                                   |
| `benchmark/*`                            | @nodejs/benchmarking, @mscdex                                         |
| `bootstrap_node.js`                      | @nodejs/process                                                       |
| `doc/*`, `*.md`                          | @nodejs/documentation                                                 |
| `lib/assert`                             | @nodejs/testing                                                       |
| `lib/async_hooks`                        | @nodejs/async\_hooks for bugs/reviews (+ @nodejs/diagnostics for API) |
| `lib/buffer`                             | @nodejs/buffer                                                        |
| `lib/child_process`                      | @nodejs/child\_process                                                |
| `lib/cluster`                            | @nodejs/cluster                                                       |
| `lib/{crypto,tls,https}`                 | @nodejs/crypto                                                        |
| `lib/dgram`                              | @nodejs/dgram                                                         |
| `lib/domains`                            | @nodejs/domains                                                       |
| `lib/fs`, `src/{fs,file}`                | @nodejs/fs                                                            |
| `lib/{_}http{*}`                         | @nodejs/http                                                          |
| `lib/inspector.js`, `src/inspector_*`    | @nodejs/v8-inspector                                                  |
| `lib/internal/url`, `src/node_url`       | @nodejs/url                                                           |
| `lib/net`                                | @bnoordhuis, @indutny, @nodejs/streams                                |
| `lib/repl`                               | @nodejs/repl                                                          |
| `lib/{_}stream{*}`                       | @nodejs/streams                                                       |
| `lib/timers`                             | @nodejs/timers                                                        |
| `lib/util`                               | @nodejs/util                                                          |
| `lib/zlib`                               | @nodejs/zlib                                                          |
| `src/async-wrap.*`                       | @nodejs/async\_hooks                                                  |
| `src/node_api.*`                         | @nodejs/n-api                                                         |
| `src/node_crypto.*`                      | @nodejs/crypto                                                        |
| `test/*`                                 | @nodejs/testing                                                       |
| `tools/node_modules/eslint`, `.eslintrc` | @nodejs/linting                                                       |
| build                                    | @nodejs/build                                                         |
| `src/module_wrap.*`, `lib/internal/loader/*`, `lib/internal/vm/Module.js` | @nodejs/modules                      |
| GYP                                      | @nodejs/gyp                                                           |
| performance                              | @nodejs/performance                                                   |
| platform specific                        | @nodejs/platform-{aix,arm,freebsd,macos,ppc,smartos,s390,windows}     |
| python code                              | @nodejs/python                                                        |
| upgrading c-ares                         | @rvagg                                                                |
| upgrading http-parser                    | @nodejs/http, @nodejs/http2                                           |
| upgrading libuv                          | @nodejs/libuv                                                         |
| upgrading npm                            | @fishrock123, @MylesBorins                                            |
| upgrading V8                             | @nodejs/v8, @nodejs/post-mortem                                       |
| Embedded use or delivery of Node.js      | @nodejs/delivery-channels                                             |

When things need extra attention, are controversial, or `semver-major`:
@nodejs/tsc

If you cannot find who to cc for a file, `git shortlog -n -s <file>` may help.

## Labels

### By Subsystem

Subsystems include:

* `lib/*.js` (`assert`, `buffer`, etc.)
* `build`
* `doc`
* `lib / src`
* `test`
* `tools`

There may be more than one subsystem valid for any particular issue or pull
request.

### General

Please use these when possible / appropriate

* `confirmed-bug` - Bugs you have verified exist
* `discuss` - Things that need larger discussion
* `feature request` - Any issue that requests a new feature (usually not PRs)
* `good first issue` - Issues suitable for newcomers to process
* `meta` - For issues whose topic is governance, policies, procedures, etc.

--

* `semver-{minor,major}`
  * be conservative – that is, if a change has the remote *chance* of breaking
    something, go for semver-major
  * when adding a semver label, add a comment explaining why you're adding it
  * minor vs. patch: roughly: "does it add a new method / does it add a new
    section to the docs"
  * major vs. everything else: run last versions tests against this version, if
    they pass, **probably** minor or patch
  * A breaking change helper
    ([full source](https://gist.github.com/chrisdickinson/ba532fa0e4e243fb7b44)):
  ```sh
  SHOW=$(git show-ref -d $(git describe --abbrev=0) | tail -n1 | awk '{print $1}')
  git checkout $(git show -s --pretty='%T' $SHOW) -- test
  make -j4 test
  ```

### LTS/Version labels

We use labels to keep track of which branches a commit should land on:

* `dont-land-on-v?.x`
  * For changes that do not apply to a certain release line
  * Also used when the work of backporting a change outweighs the benefits
* `land-on-v?.x`
  * Used by releasers to mark a PR as scheduled for inclusion in an LTS release
  * Applied to the original PR for clean cherry-picks, to the backport PR
    otherwise
* `backport-requested-v?.x`
  * Used to indicate that a PR needs a manual backport to a branch in order to
    land the changes on that branch
  * Typically applied by a releaser when the PR does not apply cleanly or it
    breaks the tests after applying
  * Will be replaced by either `dont-land-on-v?.x` or `backported-to-v?.x`
* `backported-to-v?.x`
  * Applied to PRs for which a backport PR has been merged
* `lts-watch-v?.x`
  * Applied to PRs which the LTS working group should consider including in a
    LTS release
  * Does not indicate that any specific action will be taken, but can be
    effective as messaging to non-collaborators
* `lts-agenda`
  * For things that need discussion by the LTS working group
  * (for example semver-minor changes that need or should go into an LTS
    release)
* `v?.x`
  * Automatically applied to changes that do not target `master` but rather the
    `v?.x-staging` branch

Once a release line enters maintenance mode, the corresponding labels do not
need to be attached anymore, as only important bugfixes will be included.

### Other Labels

* Operating system labels
  * `macos`, `windows`, `smartos`, `aix`
  * No linux, linux is the implied default
* Architecture labels
  * `arm`, `mips`, `s390`, `ppc`
  * No x86{_64}, since that is the implied default

## Updating Node.js from Upstream

* `git remote add upstream git://github.com/nodejs/node.git`

to update from nodejs/node:

* `git checkout master`
* `git remote update -p` OR `git fetch --all` (I prefer the former)
* `git merge --ff-only upstream/master` (or `REMOTENAME/BRANCH`)

## best practices

* commit often, out to your github fork (origin), open a PR
* when making PRs make sure to spend time on the description:
  * every moment you spend writing a good description quarters the amount of
    time it takes to understand your code.
* usually prefer to only squash at the *end* of your work, depends on the change
