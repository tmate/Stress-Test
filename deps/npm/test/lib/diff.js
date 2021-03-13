const { resolve } = require('path')
const t = require('tap')
const requireInject = require('require-inject')

const noop = () => null
let libnpmdiff = noop
let rlp = () => 'foo'
const defaultFlatOptions = {
  defaultTag: 'latest',
  diff: [],
  diffUnified: null,
  diffIgnoreAllSpace: false,
  diffNoPrefix: false,
  diffSrcPrefix: '',
  diffDstPrefix: '',
  diffText: false,
  prefix: '.',
  savePrefix: '^',
}
const npm = {
  globalDir: __dirname,
  flatOptions: { ...defaultFlatOptions },
  get prefix () {
    return this.flatOptions.prefix
  },
  output: noop,
}
const mocks = {
  npmlog: { info: noop, verbose: noop },
  libnpmdiff: (...args) => libnpmdiff(...args),
  'npm-registry-fetch': async () => ({}),
  '../../lib/utils/read-local-package.js': async () => rlp(),
  '../../lib/utils/usage.js': () => 'usage instructions',
}

t.afterEach(cb => {
  npm.flatOptions = { ...defaultFlatOptions }
  libnpmdiff = noop
  rlp = () => 'foo'
  npm.globalDir = __dirname
  cb()
})

const Diff = requireInject('../../lib/diff.js', mocks)
const diff = new Diff(npm)

t.test('no args', t => {
  t.test('in a project dir', t => {
    t.plan(3)

    const path = t.testdir({})
    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, 'foo@latest', 'should have default spec comparison')
      t.equal(b, `file:${path}`, 'should compare to cwd')
      t.match(opts, npm.flatOptions, 'should forward flat options')
    }

    npm.flatOptions.prefix = path
    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('no args, missing package.json name in cwd', t => {
    rlp = () => undefined

    diff.exec([], err => {
      t.match(
        err,
        /Needs multiple arguments to compare or run from a project dir./,
        'should throw EDIFF error msg'
      )
      t.end()
    })
  })

  t.test('no args, missing package.json in cwd', t => {
    rlp = () => {
      throw new Error('ERR')
    }

    diff.exec([], err => {
      t.match(
        err,
        /Needs multiple arguments to compare or run from a project dir./,
        'should throw EDIFF error msg'
      )
      t.end()
    })
  })

  t.end()
})

t.test('single arg', t => {
  t.test('spec using cwd package name', t => {
    t.plan(3)

    const path = t.testdir({})
    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, 'foo@1.0.0', 'should forward single spec')
      t.equal(b, `file:${path}`, 'should compare to cwd')
      t.match(opts, npm.flatOptions, 'should forward flat options')
    }

    npm.flatOptions.diff = ['foo@1.0.0']
    npm.flatOptions.prefix = path
    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('unknown spec, no package.json', t => {
    const path = t.testdir({})
    rlp = () => {
      throw new Error('ERR')
    }

    npm.flatOptions.diff = ['foo@1.0.0']
    npm.flatOptions.prefix = path
    diff.exec([], err => {
      t.match(
        err,
        /Needs multiple arguments to compare or run from a project dir./,
        'should throw usage error'
      )
      t.end()
    })
  })

  t.test('spec using semver range', t => {
    t.plan(3)

    const path = t.testdir({})
    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, 'foo@~1.0.0', 'should forward single spec')
      t.equal(b, `file:${path}`, 'should compare to cwd')
      t.match(opts, npm.flatOptions, 'should forward flat options')
    }

    npm.flatOptions.diff = ['foo@~1.0.0']
    npm.flatOptions.prefix = path
    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('version', t => {
    t.plan(3)

    const path = t.testdir({})
    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, 'foo@2.1.4', 'should convert to expected first spec')
      t.equal(b, `file:${path}`, 'should compare to cwd')
      t.match(opts, npm.flatOptions, 'should forward flat options')
    }

    npm.flatOptions.diff = ['2.1.4']
    npm.flatOptions.prefix = path
    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('version, no package.json', t => {
    rlp = () => {
      throw new Error('ERR')
    }

    npm.flatOptions.diff = ['2.1.4']
    diff.exec([], err => {
      t.match(
        err,
        /Needs multiple arguments to compare or run from a project dir./,
        'should throw an error message explaining usage'
      )
      t.end()
    })
  })

  t.test('version, filtering by files', t => {
    t.plan(3)

    const path = t.testdir({})
    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, 'foo@2.1.4', 'should use expected spec')
      t.equal(b, `file:${path}`, 'should compare to cwd')
      t.match(opts, {
        ...npm.flatOptions,
        diffFiles: [
          './foo.js',
          './bar.js',
        ],
      }, 'should forward flatOptions and diffFiles')
    }

    npm.flatOptions.diff = ['2.1.4']
    npm.flatOptions.prefix = path
    diff.exec(['./foo.js', './bar.js'], err => {
      if (err)
        throw err
    })
  })

  t.test('spec is not a dep', t => {
    t.plan(2)

    const path = t.testdir({
      node_modules: {},
      'package.json': JSON.stringify({
        name: 'my-project',
      }),
    })

    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, 'bar@1.0.0', 'should have current spec')
      t.equal(b, `file:${path}`, 'should compare to cwd')
    }

    npm.flatOptions.diff = ['bar@1.0.0']
    npm.flatOptions.prefix = path

    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('unknown package name', t => {
    t.plan(3)

    const path = t.testdir({
      'package.json': JSON.stringify({
        name: 'my-project',
        dependencies: {
          bar: '^1.0.0',
        },
      }),
    })

    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, 'simple-output@latest', 'should forward single spec')
      t.equal(b, `file:${path}`, 'should compare to cwd')
      t.match(opts, npm.flatOptions, 'should forward flat options')
    }

    npm.flatOptions.diff = ['simple-output']
    npm.flatOptions.prefix = path
    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('unknown package name, no package.json', t => {
    const path = t.testdir({})
    rlp = () => {
      throw new Error('ERR')
    }

    npm.flatOptions.diff = ['bar']
    npm.flatOptions.prefix = path
    diff.exec([], err => {
      t.match(
        err,
        /Needs multiple arguments to compare or run from a project dir./,
        'should throw usage error'
      )
      t.end()
    })
  })

  t.test('transform single direct dep name into spec comparison', t => {
    t.plan(4)

    const path = t.testdir({
      node_modules: {
        bar: {
          'package.json': JSON.stringify({
            name: 'bar',
            version: '1.0.0',
          }),
        },
      },
      'package.json': JSON.stringify({
        name: 'my-project',
        dependencies: {
          bar: '^1.0.0',
        },
      }),
    })

    npm.flatOptions.diff = ['bar']
    npm.flatOptions.prefix = path

    const Diff = requireInject('../../lib/diff.js', {
      ...mocks,
      pacote: {
        packument: (spec) => {
          t.equal(spec.name, 'bar', 'should have expected spec name')
        },
      },
      'npm-pick-manifest': (packument, target) => {
        t.equal(target, '^1.0.0', 'should use expected target')
        return { version: '1.8.10' }
      },
      libnpmdiff: async ([a, b], opts) => {
        t.equal(a, `bar@file:${resolve(path, 'node_modules/bar')}`, 'should target local node_modules pkg')
        t.equal(b, 'bar@1.8.10', 'should have possible semver range spec')
      },
    })
    const diff = new Diff(npm)

    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('global space, transform single direct dep name', t => {
    t.plan(4)

    const path = t.testdir({
      globalDir: {
        lib: {
          node_modules: {
            lorem: {
              'package.json': JSON.stringify({
                name: 'lorem',
                version: '2.0.0',
              }),
            },
          },
        },
      },
      project: {
        node_modules: {
          bar: {
            'package.json': JSON.stringify({
              name: 'bar',
              version: '1.0.0',
            }),
          },
        },
        'package.json': JSON.stringify({
          name: 'my-project',
          dependencies: {
            bar: '^1.0.0',
          },
        }),
      },
    })

    npm.flatOptions.global = true
    npm.flatOptions.diff = ['lorem']
    npm.flatOptions.prefix = resolve(path, 'project')
    npm.globalDir = resolve(path, 'globalDir/lib/node_modules')

    const Diff = requireInject('../../lib/diff.js', {
      ...mocks,
      pacote: {
        packument: (spec) => {
          t.equal(spec.name, 'lorem', 'should have expected spec name')
        },
      },
      'npm-pick-manifest': (packument, target) => {
        t.equal(target, '*', 'should always want latest in global space')
        return { version: '2.1.0' }
      },
      libnpmdiff: async ([a, b], opts) => {
        t.equal(a, `lorem@file:${resolve(path, 'globalDir/lib/node_modules/lorem')}`, 'should target local node_modules pkg')
        t.equal(b, 'lorem@2.1.0', 'should have possible semver range spec')
      },
    })
    const diff = new Diff(npm)

    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('transform single spec into spec comparison', t => {
    t.plan(2)

    const path = t.testdir({
      node_modules: {
        bar: {
          'package.json': JSON.stringify({
            name: 'bar',
            version: '1.0.0',
          }),
        },
      },
      'package.json': JSON.stringify({
        name: 'my-project',
        dependencies: {
          bar: '^1.0.0',
        },
      }),
    })

    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, `bar@file:${resolve(path, 'node_modules/bar')}`, 'should target local node_modules pkg')
      t.equal(b, 'bar@2.0.0', 'should have expected comparison spec')
    }

    npm.flatOptions.diff = ['bar@2.0.0']
    npm.flatOptions.prefix = path

    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('transform single spec from transitive deps', t => {
    t.plan(4)

    const path = t.testdir({
      node_modules: {
        bar: {
          'package.json': JSON.stringify({
            name: 'bar',
            version: '1.0.0',
            dependencies: {
              lorem: '^2.0.0',
            },
          }),
        },
        lorem: {
          'package.json': JSON.stringify({
            name: 'lorem',
            version: '2.0.0',
          }),
        },
      },
      'package.json': JSON.stringify({
        name: 'my-project',
        dependencies: {
          bar: '^1.0.0',
        },
      }),
    })

    const Diff = requireInject('../../lib/diff.js', {
      ...mocks,
      '../../lib/utils/read-local-package.js': async () => 'my-project',
      pacote: {
        packument: (spec) => {
          t.equal(spec.name, 'lorem', 'should have expected spec name')
        },
      },
      'npm-pick-manifest': (packument, target) => {
        t.equal(target, '^2.0.0', 'should target first semver-range spec found')
        return { version: '2.2.2' }
      },
      libnpmdiff: async ([a, b], opts) => {
        t.equal(a, `lorem@file:${resolve(path, 'node_modules/lorem')}`, 'should target local node_modules pkg')
        t.equal(b, 'lorem@2.2.2', 'should have expected target spec')
      },
    })
    const diff = new Diff(npm)

    npm.flatOptions.diff = ['lorem']
    npm.flatOptions.prefix = path

    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('missing actual tree', t => {
    t.plan(2)

    const path = t.testdir({
      'package.json': JSON.stringify({
        name: 'my-project',
      }),
    })

    const Diff = requireInject('../../lib/diff.js', {
      ...mocks,
      '../../lib/utils/read-local-package.js': async () => 'my-project',
      '@npmcli/arborist': class {
        constructor () {
          throw new Error('ERR')
        }
      },
      libnpmdiff: async ([a, b], opts) => {
        t.equal(a, 'lorem@latest', 'should target latest version of pkg name')
        t.equal(b, `file:${path}`, 'should target current cwd')
      },
    })
    const diff = new Diff(npm)

    npm.flatOptions.diff = ['lorem']
    npm.flatOptions.prefix = path

    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('unknown package name', t => {
    t.plan(2)

    const path = t.testdir({})
    rlp = async () => undefined
    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, 'bar@latest', 'should target latest tag of name')
      t.equal(b, `file:${path}`, 'should compare to cwd')
    }

    npm.flatOptions.diff = ['bar']
    npm.flatOptions.prefix = path

    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('use project name in project dir', t => {
    t.plan(2)

    const path = t.testdir({})
    rlp = async () => 'my-project'
    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, 'my-project@latest', 'should target latest tag of name')
      t.equal(b, `file:${path}`, 'should compare to cwd')
    }

    npm.flatOptions.diff = ['my-project']
    npm.flatOptions.prefix = path
    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('dir spec type', t => {
    t.plan(2)

    const path = t.testdir({})
    rlp = async () => 'my-project'
    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, 'file:/path/to/other-dir', 'should target dir')
      t.equal(b, `file:${path}`, 'should compare to cwd')
    }

    npm.flatOptions.diff = ['/path/to/other-dir']
    npm.flatOptions.prefix = path
    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('unsupported spec type', t => {
    rlp = async () => 'my-project'

    npm.flatOptions.diff = ['git+https://github.com/user/foo']

    diff.exec([], err => {
      t.match(
        err,
        /Spec type not supported./,
        'should throw spec type not supported error.'
      )
      t.end()
    })
  })

  t.end()
})

t.test('first arg is a qualified spec', t => {
  t.test('second arg is ALSO a qualified spec', t => {
    t.plan(3)

    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, 'bar@1.0.0', 'should set expected first spec')
      t.equal(b, 'bar@^2.0.0', 'should set expected second spec')
      t.match(opts, npm.flatOptions, 'should forward flat options')
    }

    npm.flatOptions.diff = ['bar@1.0.0', 'bar@^2.0.0']
    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('second arg is a known dependency name', t => {
    t.plan(2)

    const path = t.testdir({
      node_modules: {
        bar: {
          'package.json': JSON.stringify({
            name: 'bar',
            version: '1.0.0',
          }),
        },
      },
      'package.json': JSON.stringify({
        name: 'my-project',
        dependencies: {
          bar: '^1.0.0',
        },
      }),
    })

    rlp = async () => 'my-project'
    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, 'bar@2.0.0', 'should set expected first spec')
      t.equal(b, `bar@file:${resolve(path, 'node_modules/bar')}`, 'should target local node_modules pkg')
    }

    npm.flatOptions.prefix = path
    npm.flatOptions.diff = ['bar@2.0.0', 'bar']
    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('second arg is a valid semver version', t => {
    t.plan(2)

    npm.flatOptions.diff = ['bar@1.0.0', '2.0.0']

    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, 'bar@1.0.0', 'should set expected first spec')
      t.equal(b, 'bar@2.0.0', 'should use name from first arg')
    }

    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('second arg is an unknown dependency name', t => {
    t.plan(2)

    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, 'bar@1.0.0', 'should set expected first spec')
      t.equal(b, 'bar-fork@latest', 'should target latest tag if not a dep')
    }

    npm.flatOptions.diff = ['bar@1.0.0', 'bar-fork']
    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.end()
})

t.test('first arg is a known dependency name', t => {
  t.test('second arg is a qualified spec', t => {
    t.plan(2)

    const path = t.testdir({
      node_modules: {
        bar: {
          'package.json': JSON.stringify({
            name: 'bar',
            version: '1.0.0',
          }),
        },
      },
      'package.json': JSON.stringify({
        name: 'my-project',
        dependencies: {
          bar: '^1.0.0',
        },
      }),
    })

    rlp = async () => 'my-project'
    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, `bar@file:${resolve(path, 'node_modules/bar')}`, 'should target local node_modules pkg')
      t.equal(b, 'bar@2.0.0', 'should set expected second spec')
    }

    npm.flatOptions.prefix = path
    npm.flatOptions.diff = ['bar', 'bar@2.0.0']
    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('second arg is ALSO a known dependency', t => {
    t.plan(2)

    const path = t.testdir({
      node_modules: {
        bar: {
          'package.json': JSON.stringify({
            name: 'bar',
            version: '1.0.0',
          }),
        },
        'bar-fork': {
          'package.json': JSON.stringify({
            name: 'bar-fork',
            version: '1.0.0',
          }),
        },
      },
      'package.json': JSON.stringify({
        name: 'my-project',
        dependencies: {
          bar: '^1.0.0',
        },
      }),
    })

    rlp = async () => 'my-project'
    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, `bar@file:${resolve(path, 'node_modules/bar')}`, 'should target local node_modules pkg')
      t.equal(b, `bar-fork@file:${resolve(path, 'node_modules/bar-fork')}`, 'should target fork local node_modules pkg')
    }

    npm.flatOptions.prefix = path
    npm.flatOptions.diff = ['bar', 'bar-fork']
    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('second arg is a valid semver version', t => {
    t.plan(2)

    const path = t.testdir({
      node_modules: {
        bar: {
          'package.json': JSON.stringify({
            name: 'bar',
            version: '1.0.0',
          }),
        },
      },
      'package.json': JSON.stringify({
        name: 'my-project',
        dependencies: {
          bar: '^1.0.0',
        },
      }),
    })

    rlp = async () => 'my-project'
    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, `bar@file:${resolve(path, 'node_modules/bar')}`, 'should target local node_modules pkg')
      t.equal(b, 'bar@2.0.0', 'should use package name from first arg')
    }

    npm.flatOptions.prefix = path
    npm.flatOptions.diff = ['bar', '2.0.0']
    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('second arg is an unknown dependency name', t => {
    t.plan(2)

    const path = t.testdir({
      node_modules: {
        bar: {
          'package.json': JSON.stringify({
            name: 'bar',
            version: '1.0.0',
          }),
        },
      },
      'package.json': JSON.stringify({
        name: 'my-project',
        dependencies: {
          bar: '^1.0.0',
        },
      }),
    })

    rlp = async () => 'my-project'
    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, `bar@file:${resolve(path, 'node_modules/bar')}`, 'should target local node_modules pkg')
      t.equal(b, 'bar-fork@latest', 'should set expected second spec')
    }

    npm.flatOptions.prefix = path
    npm.flatOptions.diff = ['bar', 'bar-fork']
    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.end()
})

t.test('first arg is a valid semver range', t => {
  t.test('second arg is a qualified spec', t => {
    t.plan(2)

    npm.flatOptions.diff = ['1.0.0', 'bar@2.0.0']

    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, 'bar@1.0.0', 'should use name from second arg')
      t.equal(b, 'bar@2.0.0', 'should use expected spec')
    }

    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('second arg is a known dependency', t => {
    t.plan(2)

    const path = t.testdir({
      node_modules: {
        bar: {
          'package.json': JSON.stringify({
            name: 'bar',
            version: '2.0.0',
          }),
        },
      },
      'package.json': JSON.stringify({
        name: 'my-project',
        dependencies: {
          bar: '^1.0.0',
        },
      }),
    })

    rlp = async () => 'my-project'
    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, 'bar@1.0.0', 'should use name from second arg')
      t.equal(b, `bar@file:${resolve(path, 'node_modules/bar')}`, 'should set expected second spec from nm')
    }

    npm.flatOptions.prefix = path
    npm.flatOptions.diff = ['1.0.0', 'bar']
    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('second arg is ALSO a semver version', t => {
    t.plan(2)

    rlp = async () => 'my-project'
    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, 'my-project@1.0.0', 'should use name from project dir')
      t.equal(b, 'my-project@2.0.0', 'should use name from project dir')
    }

    npm.flatOptions.diff = ['1.0.0', '2.0.0']
    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('second arg is ALSO a semver version BUT cwd not a project dir', t => {
    const path = t.testdir({})
    rlp = () => {
      throw new Error('ERR')
    }

    npm.flatOptions.diff = ['1.0.0', '2.0.0']
    npm.flatOptions.prefix = path
    diff.exec([], err => {
      t.match(
        err,
        /Needs to be run from a project dir in order to diff two versions./,
        'should throw two versions need project dir error usage msg'
      )
      t.end()
    })
  })

  t.test('second arg is an unknown dependency name', t => {
    t.plan(2)

    rlp = async () => 'my-project'
    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, 'bar@1.0.0', 'should use name from second arg')
      t.equal(b, 'bar@latest', 'should compare against latest tag')
    }

    npm.flatOptions.diff = ['1.0.0', 'bar']
    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('second arg is a qualified spec, missing actual tree', t => {
    t.plan(2)

    const path = t.testdir({
      'package.json': JSON.stringify({
        name: 'my-project',
      }),
    })

    const Diff = requireInject('../../lib/diff.js', {
      ...mocks,
      '../../lib/utils/read-local-package.js': async () => 'my-project',
      '@npmcli/arborist': class {
        constructor () {
          throw new Error('ERR')
        }
      },
      libnpmdiff: async ([a, b], opts) => {
        t.equal(a, 'lorem@1.0.0', 'should target latest version of pkg name')
        t.equal(b, 'lorem@2.0.0', 'should target expected spec')
      },
    })
    const diff = new Diff(npm)

    npm.flatOptions.diff = ['1.0.0', 'lorem@2.0.0']
    npm.flatOptions.prefix = path

    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.end()
})

t.test('first arg is an unknown dependency name', t => {
  t.test('second arg is a qualified spec', t => {
    t.plan(4)

    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, 'bar@latest', 'should set expected first spec')
      t.equal(b, 'bar@2.0.0', 'should set expected second spec')
      t.match(opts, npm.flatOptions, 'should forward flat options')
      t.match(opts, { where: '.' }, 'should forward pacote options')
    }

    npm.flatOptions.diff = ['bar', 'bar@2.0.0']
    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('second arg is a known dependency', t => {
    t.plan(2)

    const path = t.testdir({
      node_modules: {
        bar: {
          'package.json': JSON.stringify({
            name: 'bar',
            version: '2.0.0',
          }),
        },
      },
      'package.json': JSON.stringify({
        name: 'my-project',
        dependencies: {
          bar: '^1.0.0',
        },
      }),
    })

    rlp = async () => 'my-project'
    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, 'bar-fork@latest', 'should use latest tag')
      t.equal(b, `bar@file:${resolve(path, 'node_modules/bar')}`, 'should target local node_modules pkg')
    }

    npm.flatOptions.prefix = path
    npm.flatOptions.diff = ['bar-fork', 'bar']
    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('second arg is a valid semver version', t => {
    t.plan(2)

    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, 'bar@latest', 'should use latest tag')
      t.equal(b, 'bar@^1.0.0', 'should use name from first arg')
    }

    npm.flatOptions.diff = ['bar', '^1.0.0']
    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('second arg is ALSO an unknown dependency name', t => {
    t.plan(2)

    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, 'bar@latest', 'should use latest tag')
      t.equal(b, 'bar-fork@latest', 'should use latest tag')
    }

    npm.flatOptions.diff = ['bar', 'bar-fork']
    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('cwd not a project dir', t => {
    t.plan(2)

    const path = t.testdir({})
    rlp = () => {
      throw new Error('ERR')
    }
    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, 'bar@latest', 'should use latest tag')
      t.equal(b, 'bar-fork@latest', 'should use latest tag')
    }

    npm.flatOptions.diff = ['bar', 'bar-fork']
    npm.flatOptions.prefix = path

    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.end()
})

t.test('various options', t => {
  t.test('using --name-only option', t => {
    t.plan(1)

    npm.flatOptions.diffNameOnly = true

    libnpmdiff = async ([a, b], opts) => {
      t.match(opts, {
        ...npm.flatOptions,
        diffNameOnly: true,
      }, 'should forward nameOnly=true option')
    }

    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.test('set files after both versions', t => {
    t.plan(3)

    npm.flatOptions.diff = ['2.1.4', '3.0.0']

    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, 'foo@2.1.4', 'should use expected spec')
      t.equal(b, 'foo@3.0.0', 'should use expected spec')
      t.match(opts, {
        ...npm.flatOptions,
        diffFiles: [
          './foo.js',
          './bar.js',
        ],
      }, 'should forward diffFiles values')
    }

    diff.exec(['./foo.js', './bar.js'], err => {
      if (err)
        throw err
    })
  })

  t.test('set files no diff args', t => {
    t.plan(3)

    const path = t.testdir({})
    rlp = async () => 'my-project'
    libnpmdiff = async ([a, b], opts) => {
      t.equal(a, 'my-project@latest', 'should have default spec')
      t.equal(b, `file:${path}`, 'should compare to cwd')
      t.match(opts, {
        ...npm.flatOptions,
        diffFiles: [
          './foo.js',
          './bar.js',
        ],
      }, 'should forward all remaining items as filenames')
    }

    npm.flatOptions.prefix = path
    diff.exec(['./foo.js', './bar.js'], err => {
      if (err)
        throw err
    })
  })

  t.test('using diff option', t => {
    t.plan(1)

    npm.flatOptions.diffContext = 5
    npm.flatOptions.diffIgnoreWhitespace = true
    npm.flatOptions.diffNoPrefix = false
    npm.flatOptions.diffSrcPrefix = 'foo/'
    npm.flatOptions.diffDstPrefix = 'bar/'
    npm.flatOptions.diffText = true

    libnpmdiff = async ([a, b], opts) => {
      t.match(opts, {
        ...npm.flatOptions,
        diffContext: 5,
        diffIgnoreWhitespace: true,
        diffNoPrefix: false,
        diffSrcPrefix: 'foo/',
        diffDstPrefix: 'bar/',
        diffText: true,
      }, 'should forward diff options')
    }

    diff.exec([], err => {
      if (err)
        throw err
    })
  })

  t.end()
})

t.test('too many args', t => {
  npm.flatOptions.diff = ['a', 'b', 'c']
  diff.exec([], err => {
    t.match(
      err,
      /Can't use more than two --diff arguments./,
      'should throw usage error'
    )
    t.end()
  })
})
