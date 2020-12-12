const Minipass = require('minipass')
const t = require('tap')
const requireInject = require('require-inject')
const libnpmsearchResultFixture =
  require('../fixtures/libnpmsearch-stream-result.js')

let result = ''
const flatOptions = {
  search: {
    exclude: null,
    limit: 20,
    opts: '',
  },
}
const npm = { flatOptions: { ...flatOptions } }
const npmlog = {
  silly () {},
  clearProgress () {},
}
const libnpmsearch = {
  stream () {},
}
const mocks = {
  npmlog,
  libnpmsearch,
  '../../lib/npm.js': npm,
  '../../lib/utils/output.js': (...msg) => {
    result += msg.join('\n')
  },
  '../../lib/utils/usage.js': () => 'usage instructions',
  // '../../lib/search/format-package-stream.js': a => a,
}

t.afterEach(cb => {
  result = ''
  npm.flatOptions = flatOptions
  cb()
})

const search = requireInject('../../lib/search.js', mocks)

t.test('no args', t => {
  search([], err => {
    t.match(
      err,
      /search must be called with arguments/,
      'should throw usage instructions'
    )
    t.end()
  })
})

t.test('search <name>', t => {
  const src = new Minipass()
  src.objectMode = true
  const libnpmsearch = {
    stream () {
      return src
    },
  }

  const search = requireInject('../../lib/search.js', {
    ...mocks,
    libnpmsearch,
  })

  search(['libnpm'], err => {
    if (err)
      throw err

    t.matchSnapshot(result, 'should have expected search results')

    t.end()
  })

  for (const i of libnpmsearchResultFixture)
    src.write(i)

  src.end()
})

t.test('search <name> --searchexclude --searchopts', t => {
  npm.flatOptions.search = {
    ...flatOptions.search,
    exclude: '',
  }

  const src = new Minipass()
  src.objectMode = true
  const libnpmsearch = {
    stream () {
      return src
    },
  }

  const search = requireInject('../../lib/search.js', {
    ...mocks,
    libnpmsearch,
  })

  search(['foo'], err => {
    if (err)
      throw err

    t.matchSnapshot(result, 'should have filtered expected search results')

    t.end()
  })

  src.write({
    name: 'foo',
    scope: 'unscoped',
    version: '1.0.0',
    description: '',
    keywords: [],
    date: null,
    author: { name: 'Foo', email: 'foo@npmjs.com' },
    publisher: { name: 'Foo', email: 'foo@npmjs.com' },
    maintainers: [
      { username: 'foo', email: 'foo@npmjs.com' },
    ],
  })
  src.write({
    name: 'libnpmversion',
    scope: 'unscoped',
    version: '1.0.0',
    description: '',
    keywords: [],
    date: null,
    author: { name: 'Foo', email: 'foo@npmjs.com' },
    publisher: { name: 'Foo', email: 'foo@npmjs.com' },
    maintainers: [
      { username: 'foo', email: 'foo@npmjs.com' },
    ],
  })

  src.end()
})

t.test('empty search results', t => {
  const src = new Minipass()
  src.objectMode = true
  const libnpmsearch = {
    stream () {
      return src
    },
  }

  const search = requireInject('../../lib/search.js', {
    ...mocks,
    libnpmsearch,
  })

  search(['foo'], err => {
    if (err)
      throw err

    t.matchSnapshot(result, 'should have expected search results')

    t.end()
  })

  src.end()
})

t.test('search api response error', t => {
  const src = new Minipass()
  src.objectMode = true
  const libnpmsearch = {
    stream () {
      return src
    },
  }

  const search = requireInject('../../lib/search.js', {
    ...mocks,
    libnpmsearch,
  })

  search(['foo'], err => {
    t.match(
      err,
      /ERR/,
      'should throw response error'
    )

    t.end()
  })

  src.emit('error', new Error('ERR'))

  src.end()
})
