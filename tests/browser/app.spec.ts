import { test, expect, type Page } from '@playwright/test';

test('store guide works without a key and keeps businesses separate', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A voice for your business.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start a conversation', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: /How much for a shirt/ }).click();
  await expect(page.getByRole('heading', { name: 'The knowledge behind the voice.' })).toBeVisible();
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await page.getByLabel('Knowledge store').selectOption('fox-chapel');
  await page.getByRole('tab', { name: 'Store details' }).click();
  await expect(page.getByRole('heading', { name: 'Don Royal — Fox Chapel' })).toBeVisible();
  await expect(page.getByText('1145 Freeport Rd, Pittsburgh, PA 15238')).toBeVisible();
  await page.getByRole('tab', { name: 'Kiosk guide' }).click();
  await expect(page.getByText(/Don Royal — Fox Chapel has no kiosk/)).toBeVisible();
});

test('price source, specialty escalation, and cutoff results are displayed', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Knowledge base', exact: true }).click();
  await page.getByLabel('Search store guide').fill('waist in out');
  await expect(page.locator('tbody')).toContainText('Ask store staff');
  await expect(page.locator('tbody')).toContainText('Price List · row 794');
  await page.getByRole('tab', { name: 'Turnaround' }).click();
  await page.getByLabel('Drop-off time (Eastern)').fill('08:45');
  await expect(page.locator('.schedule-option h3')).toHaveText('Wednesday after 1:00 PM');
  await page.getByLabel('Drop-off time (Eastern)').fill('08:46');
  await expect(page.locator('.schedule-option h3')).toHaveText('Thursday after 1:00 PM');
  await page.getByLabel('Knowledge store').selectOption('fox-chapel');
  await page.getByLabel('Drop-off day', { exact: true }).selectOption('Sunday');
  await expect(page.getByText(/This store is closed Sunday/)).toBeVisible();
});

test('agent setup exposes real prompts and honest integration status', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Agent setup', exact: true }).click();
  await page.locator('.agent-detail-card.gus').click();
  await page.getByText('View the full system prompt').click();
  await expect(page.locator('.prompt-card pre')).toContainText('noticeably grumpy');
  await expect(page.locator('.prompt-card pre')).toContainText('Real staff routing and callback delivery are NOT implemented');
  await expect(page.getByText('REALTIME_API_KEY', { exact: true })).toBeVisible();
});

test('mobile layout has working navigation and no horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Let’s clear things up.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Knowledge base', exact: true }).click();
  await expect(page.locator('tbody tr').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Agent setup', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Meet your voice team.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

async function mockVoice(page: Page) {
  await page.route('**/api/config', async route => {
    const response = await route.fetch(); const data = await response.json();
    await route.fulfill({ json: { ...data, voiceConfigured: true } });
  });
  await page.route('**/api/realtime/call', route => route.fulfill({ json: { sdp: 'v=0\r\ns=Test session\r\n' } }));
  // Simulates only WebRTC transport and provider events. Real app code, real tools,
  // real microphone tracks (Chromium fake device), and actual UI run normally.
  await page.addInitScript(() => {
    const state: any = { peers: [], sent: [], tracks: [] };
    (window as any).rtcMock = state;
    class FakeChannel {
      readyState = 'connecting'; onopen?: () => void; onclose?: () => void; onmessage?: (event: { data: string }) => void;
      send(value: string) { state.sent.push(JSON.parse(value)); }
      close() { this.readyState = 'closed'; this.onclose?.(); }
    }
    class FakePeer {
      channel = new FakeChannel(); connectionState = 'new'; onconnectionstatechange?: () => void;
      constructor() { state.peers.push(this); }
      addTrack(track: MediaStreamTrack) { state.tracks.push(track); }
      createDataChannel() { return this.channel; }
      async createOffer() { return { type: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n' }; }
      async setLocalDescription() {}
      async setRemoteDescription() { this.connectionState = 'connected'; this.channel.readyState = 'open'; this.channel.onopen?.(); }
      close() { this.connectionState = 'closed'; }
    }
    (window as any).RTCPeerConnection = FakePeer;
    state.emit = (event: unknown) => state.peers.at(-1).channel.onmessage({ data: JSON.stringify(event) });
  });
}
async function emit(page: Page, event: unknown) { await page.evaluate(event => (window as any).rtcMock.emit(event), event); }
async function readyCall(page: Page) {
  await mockVoice(page); await page.goto('/');
  await page.getByRole('button', { name: 'Start a conversation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'End call', exact: true })).toBeVisible();
}

test('simulated voice uses live tool results, transfers context to Gus, and ends after playback', async ({ page }) => {
  const offers: Record<string, unknown>[] = [];
  page.on('request', request => { if (request.url().endsWith('/api/realtime/call')) offers.push(request.postDataJSON()); });
  await readyCall(page);
  await emit(page, { type: 'conversation.item.input_audio_transcription.completed', item_id: 'user1', transcript: 'When are you open?' });
  await emit(page, { type: 'response.done', response: { status: 'completed', output: [{ type: 'function_call', name: 'get_store_details', arguments: '{"store_id":"solon"}', call_id: 'lookup1' }] } });
  await expect.poll(() => page.evaluate(() => (window as any).rtcMock.sent.some((event: any) => event.item?.type === 'function_call_output' && JSON.parse(event.item.output).store?.id === 'solon'))).toBe(true);
  await emit(page, { type: 'response.output_audio_transcript.done', item_id: 'answer1', transcript: 'The Solon kiosk is open 24 hours a day.' });
  await emit(page, { type: 'response.done', response: { status: 'completed', output: [] } });
  await page.getByRole('button', { name: 'Mute microphone' }).click();
  expect(await page.evaluate(() => (window as any).rtcMock.tracks[0].enabled)).toBe(false);
  await page.getByRole('button', { name: 'Unmute microphone' }).click();
  await emit(page, { type: 'response.done', response: { status: 'completed', output: [{ type: 'function_call', name: 'transfer_call', arguments: '{"reason":"Caller requested Gus"}', call_id: 'transfer1' }] } });
  await expect(page.getByRole('heading', { name: 'Gus is on the line.' })).toBeVisible();
  expect(offers.map(offer => offer.agent)).toEqual(['maya', 'gus']);
  expect(await page.evaluate(() => (window as any).rtcMock.peers[0].connectionState)).toBe('closed');
  expect(await page.evaluate(() => (window as any).rtcMock.tracks[0].readyState)).toBe('live');
  expect(await page.evaluate(() => (window as any).rtcMock.sent.some((event: any) => event.item?.content?.[0]?.text?.includes('When are you open?')))).toBe(true);
  await expect(page.getByRole('button', { name: 'Transfer to Gus', exact: true })).toBeDisabled();
  await emit(page, { type: 'output_audio_buffer.started' });
  await emit(page, { type: 'response.output_audio_transcript.done', item_id: 'bye', transcript: 'All right, goodbye.' });
  await emit(page, { type: 'response.done', response: { status: 'completed', output: [{ type: 'function_call', name: 'end_call', arguments: '{"reason":"Caller said goodbye"}', call_id: 'end1' }] } });
  await expect.poll(() => page.evaluate(() => (window as any).rtcMock.sent.some((event: any) => event.item?.call_id === 'end1'))).toBe(true);
  await expect(page.getByRole('button', { name: 'End call', exact: true })).toBeVisible();
  await emit(page, { type: 'output_audio_buffer.stopped' });
  await expect(page.getByRole('heading', { name: 'Until next time.' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).rtcMock.tracks.every((track: MediaStreamTrack) => track.readyState === 'ended'))).toBe(true);
  await page.getByRole('button', { name: /Tool activity/ }).click();
  await expect(page.locator('.tool-event')).toHaveCount(3);
});

test('manual call end releases microphone and typed turns reach the voice connection', async ({ page }) => {
  await readyCall(page);
  await emit(page, { type: 'response.done', response: { status: 'completed', output: [] } });
  await page.getByRole('textbox', { name: 'Type a message' }).fill('How do I use the kiosk?');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.locator('.message.user')).toContainText('How do I use the kiosk?');
  expect(await page.evaluate(() => (window as any).rtcMock.sent.some((event: any) => event.item?.content?.[0]?.text === 'How do I use the kiosk?'))).toBe(true);
  await page.getByRole('button', { name: 'End call', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start a new call', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).rtcMock.tracks[0].readyState)).toBe('ended');
});

test('microphone denial gives a useful error and permits a retry', async ({ page }) => {
  await mockVoice(page);
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); }; });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a conversation', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Microphone permission was denied');
  await expect(page.getByRole('button', { name: 'Start a new call', exact: true })).toBeEnabled();
});
