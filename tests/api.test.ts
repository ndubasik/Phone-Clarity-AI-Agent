import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, type AppOptions } from '../server/app.js';

async function server(options: AppOptions, run: (base: string) => Promise<void>) {
  const instance = createApp(options).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => instance.once('listening', resolve));
  const address = instance.address();
  assert.ok(address && typeof address !== 'string');
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise<void>((resolve, reject) => instance.close(error => error ? reject(error) : resolve())); }
}
const post = (base: string, path: string, body: unknown, headers: Record<string, string> = {}) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const call = { sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n', storeId: 'solon', agent: 'maya' };

test('functional knowledge requests work without an API key', async () => server({}, async base => {
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.ok, true); assert.equal(health.voiceConfigured, false);
  const prices = await (await fetch(`${base}/api/knowledge?store=solon&kind=prices&q=shirt`)).json();
  assert.ok(prices.matches.length > 0);
  const tool = await post(base, '/api/tools', { name: 'get_store_details', arguments: { store_id: 'fox-chapel' } });
  assert.equal(tool.status, 200);
  assert.match((await tool.json()).store.address, /Pittsburgh/);
}));
test('call setup explicitly reports missing credentials and rejects invalid requests', async () => server({}, async base => {
  const missing = await post(base, '/api/realtime/call', call);
  assert.equal(missing.status, 503); assert.equal((await missing.json()).code, 'missing_api_key');
  assert.equal((await post(base, '/api/realtime/call', { ...call, storeId: 'nowhere' })).status, 400);
  assert.equal((await post(base, '/api/tools', { name: 'made-up', arguments: {} })).status, 400);
  assert.equal((await post(base, '/api/realtime/call', call, { Origin: 'https://another-site.example' })).status, 403);
}));
test('SDP exchange keeps credentials server-side and configures Cedar for a handoff', async () => {
  let invoked = false;
  const fetcher = (async (url, init) => {
    invoked = true;
    assert.equal(url, 'https://api.openai.com/v1/realtime/calls');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer test-only-key');
    assert.ok(init?.body instanceof FormData);
    const sdp = init.body.get('sdp') as Blob;
    const session = JSON.parse(await (init.body.get('session') as Blob).text());
    assert.equal(await sdp.text(), call.sdp);
    assert.equal(session.audio.output.voice, 'cedar');
    assert.equal(session.model, 'gpt-realtime');
    return new Response('v=0\r\ns=Mock answer\r\n', { headers: { 'Content-Type': 'application/sdp' } });
  }) as typeof fetch;
  await server({ apiKey: 'test-only-key', fetcher }, async base => {
    const response = await post(base, '/api/realtime/call', { ...call, agent: 'gus' });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.sdp.startsWith('v=0'));
    assert.equal(JSON.stringify(payload).includes('test-only-key'), false);
    const config = await (await fetch(`${base}/api/config`)).text();
    assert.equal(config.includes('test-only-key'), false);
  });
  assert.equal(invoked, true);
});
test('upstream failures are actionable without exposing provider response bodies', async () => server({ apiKey: 'test-only-key', fetcher: (async () => new Response('private provider request details', { status: 401 })) as typeof fetch }, async base => {
  const response = await post(base, '/api/realtime/call', call);
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.providerStatus, 401);
  assert.match(body.error, /authorize/);
  assert.equal(JSON.stringify(body).includes('private provider'), false);
}));
