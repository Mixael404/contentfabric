import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyBasicAuth from '@fastify/basic-auth';
import fastifyStatic from '@fastify/static';
import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { campaignRoutes } from './routes/campaigns.js';
import { runRoutes } from './routes/runs.js';
import { systemRoutes } from './routes/system.js';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function buildApp() {
  const app = Fastify({ loggerInstance: logger.child({ component: 'http' }), trustProxy: true, bodyLimit: 2 * 1024 * 1024 });

  await app.register(fastifyBasicAuth, {
    authenticate: { realm: 'content-fabric' },
    validate: async (username, password) => {
      if (!safeEqual(username, config.ADMIN_USER) || !safeEqual(password, config.ADMIN_PASSWORD)) {
        throw new Error('Неверный логин или пароль');
      }
    },
  });

  // --- public ---
  app.get('/health', async () => ({ ok: true }));
  await app.register(fastifyStatic, {
    root: config.mediaDir,
    prefix: '/media/',
    decorateReply: false,
    index: false,
    list: false,
    maxAge: '7d',
    immutable: true,
  });

  // --- protected: API + admin SPA ---
  const adminDist = path.resolve(fileURLToPath(new URL('../../../admin/dist', import.meta.url)));
  await app.register(async (scope) => {
    scope.addHook('onRequest', scope.basicAuth);

    await scope.register(campaignRoutes, { prefix: '/api' });
    await scope.register(runRoutes, { prefix: '/api' });
    await scope.register(systemRoutes, { prefix: '/api' });

    if (fs.existsSync(path.join(adminDist, 'index.html'))) {
      await scope.register(fastifyStatic, { root: adminDist, prefix: '/', wildcard: false, index: ['index.html'] });
      scope.get('/*', async (req, reply) => {
        if (req.url.startsWith('/api/')) return reply.code(404).send({ message: 'Not found' });
        return reply.sendFile('index.html');
      });
    } else {
      logger.warn({ adminDist }, 'admin UI build not found; run "npm run build" in admin/');
      scope.get('/', async () => ({ message: 'Admin UI is not built. Run npm run build.' }));
    }
  });

  app.setErrorHandler((error: unknown, _req, reply) => {
    const err = error as Error & { statusCode?: number };
    const status = err.statusCode ?? 500;
    if (status >= 500) logger.error({ err }, 'request failed');
    reply.code(status).send({ message: err.message || 'Internal error' });
  });

  return app;
}
