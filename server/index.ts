import 'dotenv/config';
import express from 'express';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { createApp } from './app.js';

if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy) setGlobalDispatcher(new EnvHttpProxyAgent());
const app = createApp({ apiKey: process.env.REALTIME_API_KEY || process.env.OPENAI_API_KEY, model: process.env.REALTIME_MODEL || 'gpt-realtime' });
if (process.env.NODE_ENV === 'production') {
  if (!existsSync(resolve('dist/index.html'))) throw new Error('Run npm run build before starting in production.');
  app.use(express.static(resolve('dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 3000);
const server = app.listen(port, '0.0.0.0', () => console.log(`Clarity server listening on port ${port}`));
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
