import express from 'express';
import rateLimit from 'express-rate-limit';
import { z, ZodError } from 'zod';
import { guide, storeIds, storeDetails, searchPrices, searchKiosk, getTurnaround, executeTool, realtimeTools, days } from './knowledge.js';
import { agents, instructions, sessionConfig } from './agents.js';

export type AppOptions = { apiKey?: string; model?: string; fetcher?: typeof fetch };
export function createApp({ apiKey = '', model = 'gpt-realtime', fetcher = fetch }: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'POST' && req.get('origin') && new URL(req.get('origin')!).host !== req.get('host')) {
      res.status(403).json({ error: 'Requests must come from this app.' }); return;
    }
    next();
  });
  app.use(express.json({ limit: '128kb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true, voiceConfigured: Boolean(apiKey), model, stores: guide.stores.length, prices: guide.prices.length, schedules: guide.turnaround.length, kioskAnswers: guide.kiosk.length }));
  app.get('/api/config', (_req, res) => res.json({ voiceConfigured: Boolean(apiKey), model, agents, stores: guide.stores, metadata: guide.metadata, counts: { prices: guide.prices.length, turnaround: guide.turnaround.length, kiosk: guide.kiosk.length }, tools: realtimeTools.map(t => ({ name: t.name, description: t.description })), categories: [...new Set(guide.prices.map(p => p.category))] }));
  app.get('/api/knowledge', (req, res) => {
    const query = z.object({ store: z.enum(storeIds), kind: z.enum(['prices', 'turnaround', 'kiosk', 'store']), q: z.string().max(200).default(''), category: z.string().max(80).optional(), day: z.enum(days).default('Monday'), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional() }).parse(req.query);
    const result = query.kind === 'prices' ? searchPrices(query.store, query.q, query.category) : query.kind === 'turnaround' ? getTurnaround(query.store, query.day, query.time) : query.kind === 'kiosk' ? searchKiosk(query.store, query.q) : storeDetails(query.store);
    res.json(result);
  });
  app.get('/api/agents/:agent/prompt', (req, res) => {
    const agent = z.enum(['maya', 'gus']).parse(req.params.agent);
    const store = z.enum(storeIds).parse(req.query.store);
    res.json({ instructions: instructions(agent, store), voice: agents[agent].voice });
  });
  app.post('/api/tools', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }), (req, res) => {
    const { name, arguments: args } = z.object({ name: z.enum(Object.keys(Object.fromEntries(realtimeTools.map(t => [t.name, true]))) as [string, ...string[]]), arguments: z.record(z.string(), z.unknown()) }).parse(req.body);
    res.json(executeTool(name, args));
  });
  app.post('/api/realtime/call', rateLimit({ windowMs: 10 * 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res, next) => {
    try {
      const { sdp, agent, storeId } = z.object({ sdp: z.string().startsWith('v=0').min(20).max(100_000), agent: z.enum(['maya', 'gus']).default('maya'), storeId: z.enum(storeIds) }).parse(req.body);
      if (!apiKey) { res.status(503).json({ error: 'Voice is not connected yet. Add REALTIME_API_KEY to the server environment, then restart the app. Store guide tools work without a key.', code: 'missing_api_key' }); return; }
      const body = new FormData();
      body.set('sdp', new Blob([sdp], { type: 'application/sdp' }), 'offer.sdp');
      body.set('session', new Blob([JSON.stringify(sessionConfig(agent, storeId, model))], { type: 'application/json' }), 'session.json');
      const upstream = await fetcher('https://api.openai.com/v1/realtime/calls', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body, signal: AbortSignal.timeout(25_000) });
      if (!upstream.ok) {
        // Provider response bodies can contain request details; do not expose or log them.
        await upstream.body?.cancel();
        const message = upstream.status === 401 || upstream.status === 403 ? 'OpenAI could not authorize this call. Check the server key, model access, and allowed API destination.' : upstream.status === 429 ? 'OpenAI is at its usage or rate limit. Check billing or try again shortly.' : 'OpenAI could not start the voice session. Check the configured Realtime model and try again.';
        res.status(502).json({ error: message, providerStatus: upstream.status }); return;
      }
      const answer = await upstream.text();
      if (!answer.startsWith('v=0')) { res.status(502).json({ error: 'The voice provider returned an invalid connection response.' }); return; }
      res.json({ sdp: answer });
    } catch (error) { next(error); }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route.' }));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) { res.status(400).json({ error: 'Invalid request.', issues: error.issues.map(issue => ({ path: issue.path, message: issue.message })) }); return; }
    if (error instanceof SyntaxError) { res.status(400).json({ error: 'Invalid JSON request.' }); return; }
    res.status(500).json({ error: 'The request could not be completed. Please try again.' });
  });
  return app;
}
