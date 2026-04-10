// Load .env for local development. This import is only reached via server.ts
// (the local Node entry point) — the Lambda entry in lambda.ts never imports
// server.ts, so esbuild tree-shakes dotenv out of the deployment bundle.
import 'dotenv/config';

import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const app = createApp();
const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, (info) => {
	console.log(`Backend listening on http://localhost:${info.port}`);
});
