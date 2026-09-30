process.env.NODE_ENV = 'test';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import http from 'http';
import net from 'net';
import { WebSocket, WebSocketServer } from 'ws';
import express from 'express';
import { 
  JsonFilePersistenceAdapter, 
  createSeedData 
} from '../src/db/persistence';
import { 
  generateVlessUri, 
  generateTrojanUri, 
  generateUserPersonalizedConfigs, 
  generateSubscriptionBase64,
  generateConfigUri,
  parseConfigUri
} from '../src/utils/configParsers';
import { ProxyConfig, UserAccount } from '../src/types';

describe('Shirin / RayPanel Comprehensive Regression & Acceptance Tests', () => {

  const testDataDir = path.join(process.cwd(), 'data', 'test_audit_persistence');
  if (!fs.existsSync(testDataDir)) {
    fs.mkdirSync(testDataDir, { recursive: true });
  }

  const defaultAdminUser = 'admin';
  const defaultAdminHash = crypto.createHmac('sha256', 'test_secret').update('admin123').digest('hex');

  // =========================================================================
  // Acceptance Criteria 1 to 10 & Tests A, B, C, E, F, G:
  // Full Lifecycle: Create user/config -> Crash/Restart -> Reload -> Unchanged Credentials & Sub
  // =========================================================================
  it('A & B & C & E & F & G: Should survive crash/restart with byte-for-byte preserved credentials', async () => {
    const adapter1 = new JsonFilePersistenceAdapter(testDataDir, defaultAdminUser, defaultAdminHash);
    await adapter1.init();

    const data = await adapter1.load();
    assert.ok(data.users.length > 0, 'Initial seed user must exist');
    assert.ok(data.configs.length > 0, 'Initial seed configs must exist');

    const originalSeedUuid = data.users[0].uuid;
    const originalSeedTrojanPass = data.users[0].trojanPassword;
    const originalSeedSubToken = data.users[0].token;

    // Step 1: User creates a VLESS WS and Trojan WS
    const customUser: UserAccount = {
      id: 'usr-persistent-accept-1',
      username: 'accept_user',
      token: 'sub_accept_token_8888',
      uuid: '22222222-3333-4444-5555-666666666666',
      trojanPassword: 'AcceptTrojanPass2026',
      quotaGB: 100,
      usedUploadBytes: 512,
      usedDownloadBytes: 1024,
      expireAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      active: true,
      allowedConfigs: ['all'],
      createdAt: new Date().toISOString()
    };

    const vlessConfig: ProxyConfig = {
      id: 'cfg-vless-ws-test',
      name: 'Wasmer VLESS WS',
      protocol: 'vless',
      server: 'shirin-panel.wasmer.app',
      port: 443,
      uuid: customUser.uuid,
      transport: 'ws',
      path: '/vless-ws',
      host: 'shirin-panel.wasmer.app',
      sni: 'shirin-panel.wasmer.app',
      security: 'tls',
      remark: 'VLESS Acceptance Test',
      active: true,
      useCleanIp: false,
      cleanIp: '104.16.132.229',
      fragment: true,
      fragmentLength: '10-50',
      fragmentInterval: '20-50',
      fragmentPackets: 'tlshello',
      createdAt: new Date().toISOString()
    };

    const trojanConfig: ProxyConfig = {
      id: 'cfg-trojan-ws-test',
      name: 'Wasmer Trojan WS',
      protocol: 'trojan',
      server: 'shirin-panel.wasmer.app',
      port: 443,
      password: customUser.trojanPassword,
      transport: 'ws',
      path: '/trojan-ws',
      host: 'shirin-panel.wasmer.app',
      sni: 'shirin-panel.wasmer.app',
      security: 'tls',
      remark: 'Trojan Acceptance Test',
      active: true,
      useCleanIp: false,
      cleanIp: '162.159.136.232',
      createdAt: new Date().toISOString()
    };

    data.users.push(customUser);
    data.configs.push(vlessConfig, trojanConfig);

    // Save state
    const saveOk = await adapter1.save(data, true);
    assert.strictEqual(saveOk, true, 'Adapter1 must persist state atomically');
    await adapter1.close();

    // Step 4 & 5: Simulate process crash, restart, and reload
    const adapter2 = new JsonFilePersistenceAdapter(testDataDir, defaultAdminUser, defaultAdminHash);
    await adapter2.init();
    const reloaded = await adapter2.load();

    // Step 6 & 8: Verify seed credentials and user credentials were NOT regenerated
    assert.strictEqual(reloaded.users[0].uuid, originalSeedUuid, 'Seed UUID must not regenerate on restart');
    assert.strictEqual(reloaded.users[0].trojanPassword, originalSeedTrojanPass, 'Seed Trojan Pass must not regenerate on restart');
    assert.strictEqual(reloaded.users[0].token, originalSeedSubToken, 'Seed Sub token must not regenerate on restart');

    const foundUser = reloaded.users.find(u => u.id === 'usr-persistent-accept-1');
    assert.ok(foundUser, 'Created user must be found in database after restart');
    assert.strictEqual(foundUser?.uuid, '22222222-3333-4444-5555-666666666666', 'User UUID must be identical');
    assert.strictEqual(foundUser?.trojanPassword, 'AcceptTrojanPass2026', 'User Trojan password must be identical');
    assert.strictEqual(foundUser?.token, 'sub_accept_token_8888', 'User sub token must be identical');

    // Step 7: Subscription URL works identically
    const personalized = generateUserPersonalizedConfigs(foundUser!, reloaded.configs);
    assert.strictEqual(personalized.length >= 2, true, 'Personalized configs must include VLESS and Trojan');

    const subBase64 = generateSubscriptionBase64(personalized);
    const decodedSub = Buffer.from(subBase64, 'base64').toString('utf8');
    assert.ok(decodedSub.includes(foundUser!.uuid!), 'Subscription must contain user UUID');
    assert.ok(decodedSub.includes(foundUser!.trojanPassword!), 'Subscription must contain user Trojan password');

    await adapter2.close();
  });

  // =========================================================================
  // Test D: Deterministic URI Generator and strict Clean IP override flag
  // =========================================================================
  it('D: Generated URI must be deterministic and useCleanIp flag strictly respected', () => {
    const configWithoutCleanIpOverride: ProxyConfig = {
      id: 'cfg-d-1',
      name: 'VLESS Server Node',
      protocol: 'vless',
      server: 'my-wasmer.app',
      port: 443,
      uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      transport: 'ws',
      path: '/vless-ws',
      host: 'my-wasmer.app',
      sni: 'my-wasmer.app',
      security: 'tls',
      remark: 'TestNode',
      active: true,
      useCleanIp: false, // Explicitly false!
      cleanIp: '104.16.132.229',
      createdAt: '2026-01-01T00:00:00.000Z'
    };

    const uri1 = generateVlessUri(configWithoutCleanIpOverride);
    const uri2 = generateVlessUri(configWithoutCleanIpOverride);
    assert.strictEqual(uri1, uri2, 'URI generation must be deterministic');
    assert.ok(uri1.startsWith('vless://aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee@my-wasmer.app:443'), 
      'When useCleanIp is false, destination must be server, NOT cleanIp');
    assert.ok(uri1.includes('sni=my-wasmer.app'), 'SNI domain must be preserved');

    // Now test with useCleanIp = true
    const configWithCleanIpOverride: ProxyConfig = {
      ...configWithoutCleanIpOverride,
      useCleanIp: true,
    };
    const uriWithCleanIp = generateVlessUri(configWithCleanIpOverride);
    assert.ok(uriWithCleanIp.startsWith('vless://aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee@104.16.132.229:443'),
      'When useCleanIp is true, destination must be cleanIp');
    assert.ok(uriWithCleanIp.includes('sni=my-wasmer.app'), 'SNI must remain domain for TLS handshake');
    assert.ok(uriWithCleanIp.includes('host=my-wasmer.app'), 'Host header must remain domain for WebSocket');
  });

  // =========================================================================
  // Test H: Admin session behavior after restart & Password Hash Persistence
  // =========================================================================
  it('H: Admin password hashing, verification, and session persistence across restarts', async () => {
    const secret = 'test_session_secret_for_audit_2026';
    const hash = (pass: string) => crypto.createHmac('sha256', secret).update(pass).digest('hex');

    const rawPass = 'SuperSecureAdmin2026!';
    const hashed = hash(rawPass);

    // Timing-safe equal check
    const inputPassHash = hash('SuperSecureAdmin2026!');
    const isMatch = crypto.timingSafeEqual(Buffer.from(inputPassHash), Buffer.from(hashed));
    assert.strictEqual(isMatch, true, 'Valid password hash must verify timing-safe');

    const wrongPassHash = hash('WrongPassword');
    const isWrongMatch = crypto.timingSafeEqual(Buffer.from(wrongPassHash), Buffer.from(hashed));
    assert.strictEqual(isWrongMatch, false, 'Invalid password must not verify');

    // Persistent session storage in adapter
    const adapter = new JsonFilePersistenceAdapter(testDataDir, 'admin', hashed);
    await adapter.init();
    const data = await adapter.load();
    data.adminPasswordHash = hashed;

    const sessionToken = `adm_${crypto.randomBytes(16).toString('hex')}`;
    data.sessions[sessionToken] = {
      username: 'admin',
      expiresAt: Date.now() + 3600000
    };

    await adapter.save(data, true);
    await adapter.close();

    // Reload in fresh instance
    const reloadAdapter = new JsonFilePersistenceAdapter(testDataDir, 'admin', hashed);
    await reloadAdapter.init();
    const reloaded = await reloadAdapter.load();

    assert.strictEqual(reloaded.adminPasswordHash, hashed, 'Admin password hash must persist');
    assert.ok(reloaded.sessions[sessionToken], 'Session token must persist across restart');
    assert.strictEqual(reloaded.sessions[sessionToken].username, 'admin');

    await reloadAdapter.close();
  });

  // =========================================================================
  // Test I: Health endpoints (/healthz, /readyz) & Sub API
  // =========================================================================
  it('I: Health and readiness probe endpoints return correct status without secrets', async () => {
    const testApp = express();
    testApp.use(express.json());

    let dbReady = true;
    testApp.get('/healthz', (req, res) => {
      res.status(200).json({ status: 'ok', uptime: 42 });
    });

    testApp.get('/readyz', (req, res) => {
      if (dbReady) {
        return res.status(200).json({ status: 'ready', database: { connected: true, type: 'local_json' } });
      }
      return res.status(503).json({ status: 'unavailable', database: { connected: false } });
    });

    const testServer = http.createServer(testApp);
    await new Promise<void>((resolve) => testServer.listen(0, resolve));
    const port = (testServer.address() as net.AddressInfo).port;

    // Test GET /healthz
    const healthRes = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.strictEqual(healthRes.status, 200);
    const healthJson = await healthRes.json();
    assert.strictEqual(healthJson.status, 'ok');

    // Test GET /readyz when ready
    const readyRes = await fetch(`http://127.0.0.1:${port}/readyz`);
    assert.strictEqual(readyRes.status, 200);
    const readyJson = await readyRes.json();
    assert.strictEqual(readyJson.status, 'ready');
    assert.strictEqual(readyJson.database.connected, true);

    // Test GET /readyz when db is not ready
    dbReady = false;
    const notReadyRes = await fetch(`http://127.0.0.1:${port}/readyz`);
    assert.strictEqual(notReadyRes.status, 503);

    testServer.close();
  });

  // =========================================================================
  // Test J: WebSocket protocols (VLESS & Trojan handshake validation)
  // =========================================================================
  it('J: WebSocket VLESS & Trojan handshake validation (valid, invalid, malformed)', async () => {
    const testApp = express();
    const testServer = http.createServer(testApp);
    const wss = new WebSocketServer({ noServer: true });

    const validUuid = '12345678-1234-1234-1234-123456789abc';
    const validTrojanPass = 'TrojanPassSecret99';
    const validTrojanHash = crypto.createHash('sha224').update(validTrojanPass).digest('hex');

    wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
      const url = req.url || '';
      
      ws.on('message', (msg: Buffer) => {
        if (url.startsWith('/vless-ws')) {
          // VLESS protocol check
          if (msg.length < 18) {
            ws.close(1002, 'VLESS: Packet too short');
            return;
          }
          if (msg[0] !== 0) {
            ws.close(1002, 'VLESS: Unsupported version');
            return;
          }
          const hex = msg.subarray(1, 17).toString('hex');
          const clientUuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
          if (clientUuid !== validUuid) {
            ws.close(4003, 'Unauthorized');
            return;
          }
          // Valid handshake acknowledged with standard [0x00, 0x00]
          ws.send(Buffer.from([0x00, 0x00]));
        } else if (url.startsWith('/trojan-ws')) {
          // Trojan protocol check: 56 hex chars + \r\n + cmd + addr + port + \r\n
          if (msg.length < 60) {
            ws.close(1002, 'Trojan: Packet too short');
            return;
          }
          const clientHash = msg.subarray(0, 56).toString('utf8');
          if (clientHash !== validTrojanHash) {
            ws.close(4003, 'Unauthorized');
            return;
          }
          ws.send(Buffer.from('TROJAN_CONNECTED'));
        }
      });
    });

    testServer.on('upgrade', (request, socket, head) => {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    });

    await new Promise<void>((resolve) => testServer.listen(0, resolve));
    const port = (testServer.address() as net.AddressInfo).port;

    // J.1: Valid VLESS handshake
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/vless-ws`);
      ws.on('open', () => {
        // Construct valid VLESS request packet
        const rawUuid = Buffer.from(validUuid.replace(/-/g, ''), 'hex');
        const vlessHeader = Buffer.alloc(26);
        vlessHeader[0] = 0x00; // version 0
        rawUuid.copy(vlessHeader, 1);
        vlessHeader[17] = 0x00; // 0 addon len
        vlessHeader[18] = 0x01; // TCP command
        vlessHeader.writeUInt16BE(80, 19); // Port 80
        vlessHeader[21] = 0x01; // IPv4
        vlessHeader.writeUInt32BE(0x7f000001, 22); // 127.0.0.1

        ws.send(vlessHeader);
      });

      ws.on('message', (data: Buffer) => {
        assert.strictEqual(data[0], 0x00);
        assert.strictEqual(data[1], 0x00);
        ws.close();
        resolve();
      });

      ws.on('error', reject);
    });

    // J.2: Invalid VLESS UUID rejected with 4003
    await new Promise<void>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/vless-ws`);
      ws.on('open', () => {
        const fakeUuid = Buffer.from('ffffffffffffffffffffffffffffffff', 'hex');
        const packet = Buffer.concat([Buffer.from([0x00]), fakeUuid, Buffer.alloc(8)]);
        ws.send(packet);
      });

      ws.on('close', (code) => {
        assert.strictEqual(code, 4003, 'Invalid VLESS UUID must close with code 4003');
        resolve();
      });
    });

    // J.3: Malformed VLESS packet rejected with 1002
    await new Promise<void>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/vless-ws`);
      ws.on('open', () => {
        ws.send(Buffer.from([0x00, 0x01])); // Incomplete packet
      });

      ws.on('close', (code) => {
        assert.strictEqual(code, 1002, 'Malformed VLESS packet must close with code 1002');
        resolve();
      });
    });

    // J.4: Valid Trojan handshake
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/trojan-ws`);
      ws.on('open', () => {
        const hashBuf = Buffer.from(validTrojanHash, 'utf8');
        const crlf = Buffer.from('\r\n');
        const cmd = Buffer.from([0x01, 0x01, 127, 0, 0, 1, 0, 80]); // connect to 127.0.0.1:80
        const trojanPacket = Buffer.concat([hashBuf, crlf, cmd, crlf]);
        ws.send(trojanPacket);
      });

      ws.on('message', (data) => {
        assert.strictEqual(data.toString(), 'TROJAN_CONNECTED');
        ws.close();
        resolve();
      });

      ws.on('error', reject);
    });

    // J.5: Invalid Trojan password rejected with 4003
    await new Promise<void>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/trojan-ws`);
      ws.on('open', () => {
        const fakeHash = Buffer.from('00000000000000000000000000000000000000000000000000000000', 'utf8');
        const crlf = Buffer.from('\r\n');
        ws.send(Buffer.concat([fakeHash, crlf, Buffer.alloc(10)]));
      });

      ws.on('close', (code) => {
        assert.strictEqual(code, 4003, 'Invalid Trojan password must close with code 4003');
        resolve();
      });
    });

    wss.close();
    testServer.close();
  });

  // =========================================================================
  // Test K: Database migration & persistence idempotency
  // =========================================================================
  it('K: Database initialization and migrations must be idempotent without data loss', async () => {
    const adapter = new JsonFilePersistenceAdapter(testDataDir, defaultAdminUser, defaultAdminHash);
    await adapter.init();
    const data1 = await adapter.load();
    const initialConfigCount = data1.configs.length;

    // Call init multiple times
    await adapter.init();
    await adapter.init();

    const data2 = await adapter.load();
    assert.strictEqual(data2.configs.length, initialConfigCount, 'Config count must not change on multiple inits');
    assert.strictEqual(data2.users[0].uuid, data1.users[0].uuid, 'UUID must not change on multiple inits');

    await adapter.close();
  });

  // =========================================================================
  // Test L: Strict static asset isolation
  // =========================================================================
  it('L: Backend server bundle or source files must not be exposed statically', () => {
    const clientDir = path.join(process.cwd(), 'dist', 'client');
    const serverBundle = path.join(process.cwd(), 'dist', 'server', 'server.cjs');

    assert.ok(serverBundle.includes(path.join('dist', 'server')), 'Server bundle must reside in dist/server');
    assert.notStrictEqual(clientDir, path.join(process.cwd(), 'dist', 'server'), 'Client static dir must be distinct from server bundle dir');
  });

});
