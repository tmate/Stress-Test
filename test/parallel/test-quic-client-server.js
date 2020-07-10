// Flags: --expose-internals --no-warnings
'use strict';

// Tests a simple QUIC client/server round-trip

const common = require('../common');
if (!common.hasQuic)
  common.skip('missing quic');

const { internalBinding } = require('internal/test/binding');
const {
  constants: {
    NGTCP2_NO_ERROR,
    QUIC_ERROR_APPLICATION,
  }
} = internalBinding('quic');

const { Buffer } = require('buffer');
const Countdown = require('../common/countdown');
const assert = require('assert');
const fs = require('fs');
const {
  key,
  cert,
  ca,
  debug,
} = require('../common/quic');

const filedata = fs.readFileSync(__filename, { encoding: 'utf8' });

const { createQuicSocket } = require('net');

const kStatelessResetToken =
  Buffer.from('000102030405060708090A0B0C0D0E0F', 'hex');

let client;

const server = createQuicSocket({
  validateAddress: true,
  statelessResetSecret: kStatelessResetToken
});

const unidata = ['I wonder if it worked.', 'test'];
const kServerName = 'agent2';  // Intentionally the wrong servername
const kALPN = 'zzz';  // ALPN can be overriden to whatever we want

const countdown = new Countdown(2, () => {
  debug('Countdown expired. Destroying sockets');
  server.close();
  client.close();
});

server.listen({
  key,
  cert,
  ca,
  requestCert: true,
  rejectUnauthorized: false,
  alpn: kALPN,
});

server.on('session', common.mustCall((session) => {
  debug('QuicServerSession Created');

  assert.strictEqual(session.maxStreams.bidi, 100);
  assert.strictEqual(session.maxStreams.uni, 3);

  {
    const {
      address,
      family,
      port
    } = session.remoteAddress;
    const endpoint = client.endpoints[0].address;
    assert.strictEqual(port, endpoint.port);
    assert.strictEqual(family, endpoint.family);
    debug(`QuicServerSession Client ${family} address ${address}:${port}`);
  }

  session.on('usePreferredAddress', common.mustNotCall());

  session.on('clientHello', common.mustCall(
    (alpn, servername, ciphers, cb) => {
      assert.strictEqual(alpn, kALPN);
      assert.strictEqual(servername, kServerName);
      assert.strictEqual(ciphers.length, 4);
      cb();
    }));

  session.on('OCSPRequest', common.mustCall(
    (servername, context, cb) => {
      debug('QuicServerSession received a OCSP request');
      assert.strictEqual(servername, kServerName);

      // This will be a SecureContext. By default it will
      // be the SecureContext used to create the QuicSession.
      // If the user wishes to do something with it, it can,
      // but if it wishes to pass in a new SecureContext,
      // it can pass it in as the second argument to the
      // callback below.
      assert(context);
      debug('QuicServerSession Certificate: ', context.getCertificate());
      debug('QuicServerSession Issuer: ', context.getIssuer());

      // The callback can be invoked asynchronously
      setImmediate(() => {
        // The first argument is a potential error,
        // in which case the session will be destroyed
        // immediately.
        // The second is an optional new SecureContext
        // The third is the ocsp response.
        // All arguments are optional
        cb(null, null, Buffer.from('hello'));
      });
    }));

  session.on('secure', common.mustCall((servername, alpn, cipher) => {
    debug('QuicServerSession TLS Handshake Complete');
    debug('  Server name: %s', servername);
    debug('  ALPN: %s', alpn);
    debug('  Cipher: %s, %s', cipher.name, cipher.version);
    assert.strictEqual(session.servername, servername);
    assert.strictEqual(servername, kServerName);
    assert.strictEqual(session.alpnProtocol, alpn);

    assert.strictEqual(session.getPeerCertificate().subject.CN, 'agent1');

    assert(session.authenticated);
    assert.strictEqual(session.authenticationError, undefined);

    const uni = session.openStream({ halfOpen: true });
    assert(uni.unidirectional);
    assert(!uni.bidirectional);
    assert(uni.serverInitiated);
    assert(!uni.clientInitiated);
    assert(!uni.pending);
    uni.write(unidata[0], common.mustCall());
    uni.end(unidata[1], common.mustCall());
    uni.on('finish', common.mustCall());
    uni.on('end', common.mustCall());
    uni.on('data', common.mustNotCall());
    uni.on('close', common.mustCall(() => {
      assert.strictEqual(uni.finalSize, 0);
    }));
    debug('Unidirectional, Server-initiated stream %d opened', uni.id);
  }));

  session.on('stream', common.mustCall((stream) => {
    debug('Bidirectional, Client-initiated stream %d received', stream.id);
    assert.strictEqual(stream.id, 0);
    assert.strictEqual(stream.session, session);
    assert(stream.bidirectional);
    assert(!stream.unidirectional);
    assert(stream.clientInitiated);
    assert(!stream.serverInitiated);
    assert(!stream.pending);

    const file = fs.createReadStream(__filename);
    let data = '';
    file.pipe(stream);
    stream.setEncoding('utf8');
    stream.on('blocked', common.mustNotCall());
    stream.on('data', (chunk) => {
      data += chunk;

      debug('Server: min data rate: %f', stream.dataRateHistogram.min);
      debug('Server: max data rate: %f', stream.dataRateHistogram.max);
      debug('Server: data rate 50%: %f',
            stream.dataRateHistogram.percentile(50));
      debug('Server: data rate 99%: %f',
            stream.dataRateHistogram.percentile(99));

      debug('Server: min data size: %f', stream.dataSizeHistogram.min);
      debug('Server: max data size: %f', stream.dataSizeHistogram.max);
      debug('Server: data size 50%: %f',
            stream.dataSizeHistogram.percentile(50));
      debug('Server: data size 99%: %f',
            stream.dataSizeHistogram.percentile(99));
    });
    stream.on('end', common.mustCall(() => {
      assert.strictEqual(data, filedata);
      debug('Server received expected data for stream %d', stream.id);
    }));
    stream.on('finish', common.mustCall());
    stream.on('close', common.mustCall(() => {
      assert.strictEqual(typeof stream.duration, 'number');
      assert.strictEqual(typeof stream.bytesReceived, 'number');
      assert.strictEqual(typeof stream.bytesSent, 'number');
      assert.strictEqual(typeof stream.maxExtendedOffset, 'number');
      assert.strictEqual(stream.finalSize, filedata.length);
    }));
  }));

  session.on('close', common.mustCall(() => {
    const {
      code,
      family
    } = session.closeCode;
    debug(`Server session closed with code ${code} (family: ${family})`);
    assert.strictEqual(code, NGTCP2_NO_ERROR);

    const err = {
      code: 'ERR_INVALID_STATE',
      name: 'Error'
    };
    assert.throws(() => session.ping(), err);
    assert.throws(() => session.openStream(), err);
    assert.throws(() => session.updateKey(), err);
  }));
}));

server.on('ready', common.mustCall(() => {
  const endpoints = server.endpoints;
  for (const endpoint of endpoints) {
    const address = endpoint.address;
    debug('Server is listening on address %s:%d',
          address.address,
          address.port);
  }
  const endpoint = endpoints[0];

  client = createQuicSocket({ client: { key, cert, ca, alpn: kALPN }
  });

  client.on('close', common.mustCall(() => {
    debug('Client closing. Duration', client.duration);
    debug('  Bound duration',
          client.boundDuration);
    debug('  Bytes Sent/Received: %d/%d',
          client.bytesSent,
          client.bytesReceived);
    debug('  Packets Sent/Received: %d/%d',
          client.packetsSent,
          client.packetsReceived);
    debug('  Sessions:', client.clientSessions);
  }));

  const req = client.connect({
    address: 'localhost',
    port: endpoint.address.port,
    servername: kServerName,
    requestOCSP: true,
  });

  assert.strictEqual(req.servername, kServerName);

  req.on('usePreferredAddress', common.mustNotCall());

  req.on('OCSPResponse', common.mustCall((response) => {
    debug(`QuicClientSession OCSP response: "${response.toString()}"`);
    assert.strictEqual(response.toString(), 'hello');
  }));

  req.on('sessionTicket', common.mustCall((ticket, params) => {
    debug('Session ticket received');
    assert(ticket instanceof Buffer);
    assert(params instanceof Buffer);
    debug('  Ticket: %s', ticket.toString('hex'));
    debug('  Params: %s', params.toString('hex'));
  }, 2));

  req.on('secure', common.mustCall((servername, alpn, cipher) => {
    debug('QuicClientSession TLS Handshake Complete');
    debug('  Server name: %s', servername);
    debug('  ALPN: %s', alpn);
    debug('  Cipher: %s, %s', cipher.name, cipher.version);
    assert.strictEqual(servername, kServerName);
    assert.strictEqual(req.servername, kServerName);
    assert.strictEqual(alpn, kALPN);
    assert.strictEqual(req.alpnProtocol, kALPN);
    assert(req.ephemeralKeyInfo);
    assert.strictEqual(req.getPeerCertificate().subject.CN, 'agent1');

    debug('Client, min handshake ack: %f',
          req.handshakeAckHistogram.min);
    debug('Client, max handshake ack: %f',
          req.handshakeAckHistogram.max);
    debug('Client, min handshake rate: %f',
          req.handshakeContinuationHistogram.min);
    debug('Client, max handshake rate: %f',
          req.handshakeContinuationHistogram.max);

    // The server's identity won't be valid because the requested
    // SNI hostname does not match the certificate used.
    debug('QuicClientSession server is %sauthenticated',
          req.authenticated ? '' : 'not ');
    assert(!req.authenticated);
    assert.throws(() => { throw req.authenticationError; }, {
      code: 'ERR_QUIC_VERIFY_HOSTNAME_MISMATCH',
      message: 'Hostname mismatch'
    });

    {
      const {
        address,
        family,
        port
      } = req.remoteAddress;
      const endpoint = server.endpoints[0].address;
      assert.strictEqual(port, endpoint.port);
      assert.strictEqual(family, endpoint.family);
      debug(`QuicClientSession Server ${family} address ${address}:${port}`);
    }

    const file = fs.createReadStream(__filename);
    const stream = req.openStream();
    file.pipe(stream);
    let data = '';
    stream.resume();
    stream.setEncoding('utf8');
    stream.on('blocked', common.mustNotCall());
    stream.on('data', (chunk) => data += chunk);
    stream.on('finish', common.mustCall());
    stream.on('end', common.mustCall(() => {
      assert.strictEqual(data, filedata);
      debug('Client received expected data for stream %d', stream.id);
    }));
    stream.on('close', common.mustCall(() => {
      debug('Bidirectional, Client-initiated stream %d closed', stream.id);
      assert.strictEqual(stream.finalSize, filedata.length);
      countdown.dec();
    }));
    debug('Bidirectional, Client-initiated stream %d opened', stream.id);
  }));

  req.on('stream', common.mustCall((stream) => {
    debug('Unidirectional, Server-initiated stream %d received', stream.id);
    let data = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => data += chunk);
    stream.on('end', common.mustCall(() => {
      assert.strictEqual(data, unidata.join(''));
      debug('Client received expected data for stream %d', stream.id);
    }));
    stream.on('close', common.mustCall(() => {
      debug('Unidirectional, Server-initiated stream %d closed', stream.id);
      assert.strictEqual(stream.finalSize, 26);
      countdown.dec();
    }));
  }));

  req.on('close', common.mustCall(() => {
    const {
      code,
      family
    } = req.closeCode;
    debug(`Client session closed with code ${code} (family: ${family})`);
    assert.strictEqual(code, NGTCP2_NO_ERROR);
    assert.strictEqual(family, QUIC_ERROR_APPLICATION);
  }));
}));

server.on('listening', common.mustCall());
server.on('close', () => {
  debug('Server closing. Duration', server.duration);
  debug('  Bound duration:',
        server.boundDuration);
  debug('  Listen duration:',
        server.listenDuration);
  debug('  Bytes Sent/Received: %d/%d',
        server.bytesSent,
        server.bytesReceived);
  debug('  Packets Sent/Received: %d/%d',
        server.packetsSent,
        server.packetsReceived);
  debug('  Sessions:', server.serverSessions);
});
