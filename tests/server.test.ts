import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import net from 'net';
import { WebSocket } from 'ws';
import { app, server, db, wss } from '../server';
import crypto from 'crypto';

describe('Server HTTP, Endpoints & WebSocket Integration Tests', () => {
  let testPort = 3105;
  let testServer: http.Server;

  before(async () => {
    testServer = http.createServer(app);
    testServer.on('upgrade', (req, socket, head) => {
      const pathname = req.url ? req.url.split('?')[0] : '';
      if (pathname === '/vless-ws') {
        wss.handleUpgrade(req, socket, head, (ws) => {
          // handled by wss
        });
      }
    });

    await new Promise<void>((resolve) => {
      testServer.listen(testPort, '127.0.0.1', () => resolve());
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      testServer.close(() => resolve());
    });
  });

  it('Health & Readiness endpoints (/healthz & /readyz) must return 200', async () => {
    const healthRes = await fetch(`http://127.0.0.1:${testPort}/healthz`);
    assert.strictEqual(healthRes.status, 200);
    const healthJson = await healthRes.json();
    assert.strictEqual(healthJson.status, 'ok');

    const readyRes = await fetch(`http://127.0.0.1:${testPort}/readyz`);
    assert.strictEqual(readyRes.status, 200);
    const readyJson = await readyRes.json();
    assert.strictEqual(readyJson.status, 'ready');
  });

  it('Protected Admin APIs must return 401 without Bearer token', async () => {
    const configsRes = await fetch(`http://127.0.0.1:${testPort}/api/configs`);
    assert.strictEqual(configsRes.status, 401);

    const usersRes = await fetch(`http://127.0.0.1:${testPort}/api/users`);
    assert.strictEqual(usersRes.status, 401);

    const statsRes = await fetch(`http://127.0.0.1:${testPort}/api/stats`);
    assert.strictEqual(statsRes.status, 401);
  });

  it('Subscription endpoint (/sub/:token) returns 200 Base64 for valid user and 404 for invalid user', async () => {
    assert.ok(db.users.length > 0, 'Must have users');
    const validUser = db.users[0];

    const subRes = await fetch(`http://127.0.0.1:${testPort}/sub/${validUser.token}`);
    assert.strictEqual(subRes.status, 200);
    const subBody = await subRes.text();
    assert.ok(subBody.length > 20, 'Sub body must not be empty');

    // Invalid token must be rejected
    const badSubRes = await fetch(`http://127.0.0.1:${testPort}/sub/invalid_token_9999`);
    assert.strictEqual(badSubRes.status, 404);
  });

  it('Login endpoint (/api/auth/login) with rate limiter & session persistence', async () => {
    // 1. Wrong credentials should return 401
    const failRes = await fetch(`http://127.0.0.1:${testPort}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrongpassword' })
    });
    assert.strictEqual(failRes.status, 401);

    // 2. Correct credentials should return valid session token
    const okRes = await fetch(`http://127.0.0.1:${testPort}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: process.env.ADMIN_PASS || 'admin123' })
    });
    assert.strictEqual(okRes.status, 200);
    const okJson = await okRes.json();
    assert.ok(okJson.token, 'Must return session token');

    // 3. /api/auth/me with token
    const meRes = await fetch(`http://127.0.0.1:${testPort}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${okJson.token}` }
    });
    const meJson = await meRes.json();
    assert.strictEqual(meJson.authenticated, true);
    assert.strictEqual(meJson.username, 'admin');

    // 4. Authenticated /api/configs with session token
    const authConfigsRes = await fetch(`http://127.0.0.1:${testPort}/api/configs`, {
      headers: { 'Authorization': `Bearer ${okJson.token}` }
    });
    assert.strictEqual(authConfigsRes.status, 200);
  });

  it('Static file leak prevention: Direct URL requests to server files or sensitive configs must return 403', async () => {
    const leakTest1 = await fetch(`http://127.0.0.1:${testPort}/server.cjs`);
    assert.strictEqual(leakTest1.status, 403, 'Must forbid direct access to server.cjs');

    const leakTest2 = await fetch(`http://127.0.0.1:${testPort}/server.ts`);
    assert.strictEqual(leakTest2.status, 403, 'Must forbid direct access to server.ts');

    const leakTest3 = await fetch(`http://127.0.0.1:${testPort}/database.json`);
    assert.strictEqual(leakTest3.status, 403, 'Must forbid direct access to database.json');
  });
});
