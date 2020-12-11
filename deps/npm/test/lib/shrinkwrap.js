const t = require('tap')
const requireInject = require('require-inject')

const npm = {
  lockfileVersion: 2,
  globalDir: '',
  flatOptions: {
    depth: 0,
    global: false,
  },
  prefix: '',
}
const tree = {
  meta: {
    hiddenLockfile: null,
    loadedFromDisk: false,
    filename: '',
    originalLockfileVersion: 2,
    save () {},
  },
}
const mocks = {
  npmlog: { notice () {} },
  '@npmcli/arborist': class {
    loadVirtual () {
      return tree
    }

    loadActual () {
      return tree
    }
  },
  '../../lib/npm.js': npm,
  '../../lib/utils/usage.js': () => 'usage instructions',
}

t.afterEach(cb => {
  npm.prefix = ''
  npm.flatOptions.global = false
  npm.globalDir = ''
  cb()
})

t.test('no args', t => {
  t.plan(4)

  npm.prefix = '/project/a'

  class Arborist {
    constructor (args) {
      t.deepEqual(
        args,
        { ...npm.flatOptions, path: npm.prefix },
        'should call arborist contructor with expected args'
      )
    }

    async loadVirtual () {
      t.ok('should load virtual tree')
      return {
        ...tree,
        meta: {
          ...tree.meta,
          save () {
            t.ok('should save the lockfile')
          },
        },
      }
    }
  }

  const npmlog = {
    notice (title, msg) {
      t.equal(
        msg,
        'created a lockfile as npm-shrinkwrap.json',
        'should log notice msg that file was successfully created'
      )
    },
  }

  const shrinkwrap = requireInject('../../lib/shrinkwrap.js', {
    ...mocks,
    npmlog,
    '@npmcli/arborist': Arborist,
  })

  shrinkwrap([], err => {
    if (err)
      throw err
  })
})

t.test('no virtual tree', t => {
  t.plan(4)

  npm.prefix = '/project/a'

  class Arborist {
    constructor (args) {
      t.deepEqual(
        args,
        { ...npm.flatOptions, path: npm.prefix },
        'should call arborist contructor with expected args'
      )
    }

    async loadVirtual () {
      throw new Error('ERR')
    }

    async loadActual () {
      t.ok('should load actual tree')
      return {
        ...tree,
        meta: {
          ...tree.meta,
          save () {
            t.ok('should save the lockfile')
          },
        },
      }
    }
  }

  const npmlog = {
    notice (title, msg) {
      t.equal(
        msg,
        'created a lockfile as npm-shrinkwrap.json',
        'should log notice msg that file was successfully created'
      )
    },
  }

  const shrinkwrap = requireInject('../../lib/shrinkwrap.js', {
    ...mocks,
    npmlog,
    '@npmcli/arborist': Arborist,
  })

  shrinkwrap([], err => {
    if (err)
      throw err
  })
})

t.test('existing package-json file', t => {
  t.plan(5)

  npm.prefix = '/project/a'

  class Arborist {
    constructor (args) {
      t.deepEqual(
        args,
        { ...npm.flatOptions, path: npm.prefix },
        'should call arborist contructor with expected args'
      )
    }

    async loadVirtual () {
      t.ok('should load virtual tree')
      return {
        ...tree,
        meta: {
          hiddenLockfile: false,
          loadedFromDisk: true,
          filename: 'package-lock.json',
          save () {
            t.ok('should save the lockfile')
          },
        },
      }
    }
  }

  const npmlog = {
    notice (title, msg) {
      t.equal(
        msg,
        'package-lock.json has been renamed to npm-shrinkwrap.json',
        'should log notice msg that file was renamed'
      )
    },
  }

  const fs = {
    promises: {
      unlink (filename) {
        t.equal(filename, 'package-lock.json', 'should remove old lockfile')
      },
    },
  }

  const shrinkwrap = requireInject('../../lib/shrinkwrap.js', {
    ...mocks,
    fs,
    npmlog,
    '@npmcli/arborist': Arborist,
  })

  shrinkwrap([], err => {
    if (err)
      throw err
  })
})

t.test('update shrinkwrap file version', t => {
  t.plan(4)

  npm.prefix = '/project/a'

  class Arborist {
    constructor (args) {
      t.deepEqual(
        args,
        { ...npm.flatOptions, path: npm.prefix },
        'should call arborist contructor with expected args'
      )
    }

    async loadVirtual () {
      t.ok('should load virtual tree')
      return {
        ...tree,
        meta: {
          hiddenLockfile: false,
          loadedFromDisk: true,
          filename: 'npm-shrinkwrap.json',
          originalLockfileVersion: 1,
          save () {
            t.ok('should save the lockfile')
          },
        },
      }
    }
  }

  const npmlog = {
    notice (title, msg) {
      t.equal(
        msg,
        'npm-shrinkwrap.json updated to version 2',
        'should log notice msg that file was updated'
      )
    },
  }

  const shrinkwrap = requireInject('../../lib/shrinkwrap.js', {
    ...mocks,
    npmlog,
    '@npmcli/arborist': Arborist,
  })

  shrinkwrap([], err => {
    if (err)
      throw err
  })
})

t.test('update to date shrinkwrap file', t => {
  t.plan(4)

  npm.prefix = '/project/a'

  class Arborist {
    constructor (args) {
      t.deepEqual(
        args,
        { ...npm.flatOptions, path: npm.prefix },
        'should call arborist contructor with expected args'
      )
    }

    async loadVirtual () {
      t.ok('should load virtual tree')
      return {
        ...tree,
        meta: {
          hiddenLockfile: false,
          loadedFromDisk: true,
          filename: 'npm-shrinkwrap.json',
          originalLockfileVersion: 2,
          save () {
            t.ok('should save the lockfile')
          },
        },
      }
    }
  }

  const npmlog = {
    notice (title, msg) {
      t.equal(
        msg,
        'npm-shrinkwrap.json up to date',
        'should log notice msg shrinkwrap up to date'
      )
    },
  }

  const shrinkwrap = requireInject('../../lib/shrinkwrap.js', {
    ...mocks,
    npmlog,
    '@npmcli/arborist': Arborist,
  })

  shrinkwrap([], err => {
    if (err)
      throw err
  })
})

t.test('shrinkwrap --global', t => {
  const shrinkwrap = requireInject('../../lib/shrinkwrap.js', mocks)

  npm.flatOptions.global = true

  shrinkwrap([], err => {
    t.match(
      err,
      /does not work for global packages/,
      'should throw no global support msg'
    )
    t.equal(err.code, 'ESHRINKWRAPGLOBAL', 'should throw expected error code')
    t.end()
  })
})
