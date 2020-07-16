// Flags: --no-warnings
'use strict';
const common = require('../common');
if (!common.hasQuic)
  common.skip('missing quic');

const path = require('path');
const { createQuicSocket } = require('net');
const { once } = require('events');

const { key, cert, ca } = require('../common/quic');
const options = { key, cert, ca, alpn: 'meow' };

const server = createQuicSocket({ server: options });
const client = createQuicSocket({ client: options });

(async function() {
  server.on('session', common.mustCall((session) => {
    session.on('secure', common.mustCall((servername, alpn, cipher) => {
      const stream = session.openStream({ halfOpen: true });
      const nonexistentPath = path.resolve(__dirname, 'nonexistent.file');
      stream.sendFile(nonexistentPath, {
        onError: common.expectsError({
          code: 'ENOENT',
          syscall: 'open',
          path: nonexistentPath
        })
      });
      session.close();
    }));

    session.on('close', common.mustCall());
  }));

  await server.listen();

  const req = await client.connect({
    address: 'localhost',
    port: server.endpoints[0].address.port
  });

  req.on('stream', common.mustNotCall());

  req.on('close', common.mustCall(() => {
    client.close();
    server.close();
  }));

  await Promise.all([
    once(server, 'close'),
    once(client, 'close')
  ]);
})().then(common.mustCall());
