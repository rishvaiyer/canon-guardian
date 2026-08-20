import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';

const cloudRoutes = [
  '/api/agent/review',
  '/api/agent/canon-candidates',
  '/api/agent/ask-canon'
];

async function listenOnAvailablePort(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

async function waitForServer(baseUrl, child, output) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`agent server exited early\n${output()}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // The child process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`agent server did not become ready\n${output()}`);
}

test('public server keeps cloud actions off before provider or database access', async (t) => {
  let providerRequests = 0;
  const providerProbe = createServer((_request, response) => {
    providerRequests += 1;
    response.writeHead(500, { 'content-type': 'application/json' });
    response.end('{"error":"provider boundary must not be reached"}');
  });
  const providerPort = await listenOnAvailablePort(providerProbe);
  t.after(() => providerProbe.close());

  const portProbe = createServer();
  const appPort = await listenOnAvailablePort(portProbe);
  await new Promise((resolve, reject) => portProbe.close((error) => error ? reject(error) : resolve()));

  const childEnvironment = {
    ...process.env,
    PORT: String(appPort),
    RAILWAY_ENVIRONMENT: '',
    STORY_CLOUD_ACTIONS_ENABLED: '',
    GOOGLE_CLOUD_PROJECT: 'must-not-be-used',
    CLICKHOUSE_HOST: '127.0.0.1',
    CLICKHOUSE_PORT: String(providerPort),
    CLICKHOUSE_SECURE: 'false',
    CLICKHOUSE_PASSWORD: 'must-not-be-used',
    CLICKHOUSE_MCP_URL: `http://127.0.0.1:${providerPort}/mcp`
  };
  const child = spawn(process.execPath, ['agent-server.mjs'], {
    cwd: process.cwd(),
    env: childEnvironment,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const output = () => `${stdout}${stderr}`;
  t.after(async () => {
    if (child.exitCode === null) child.kill('SIGTERM');
    if (child.exitCode === null) await once(child, 'exit');
  });

  const baseUrl = `http://127.0.0.1:${appPort}`;
  await waitForServer(baseUrl, child, output);

  const healthResponse = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), {
    configured: false,
    cloudActionsEnabled: false,
    cloudActionsAvailable: false,
    mode: 'browser-local',
    provider: 'Browser-local Story CI',
    clickhouseMcp: false,
    message: 'Cloud actions are disabled on this public showcase. Use the browser-local continuity check and Story CI.'
  });

  for (const route of cloudRoutes) {
    const response = await fetch(`${baseUrl}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ consent: true, projectTitle: 'Shared title', revisionText: 'private draft', canonText: 'private canon', question: 'private question', lockedFacts: [{ id: 'private' }] })
    });
    assert.equal(response.status, 503, `${route} must fail closed`);
    const payload = await response.json();
    assert.equal(payload.mode, 'browser-local');
    assert.match(payload.error, /Cloud actions are disabled/);
  }

  const rootResponse = await fetch(`${baseUrl}/`);
  assert.equal(rootResponse.status, 200);
  const root = await rootResponse.text();
  assert.match(root, /Treat canon like/);
  assert.match(root, /Cloud actions are off on this public showcase/);
  assert.equal(providerRequests, 0, 'disabled health and POST routes must not reach provider, MCP, or database probes');
});
