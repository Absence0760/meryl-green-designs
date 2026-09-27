// Local Node entry point. load-dev-env must stay the first import: it
// populates process.env from .env.development(.local) before app.ts and
// its dependencies evaluate. The Lambda entry in lambda.ts never imports
// this file, so esbuild tree-shakes dotenv out of the deployment bundle.
import './load-dev-env.js';

import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const app = createApp();
const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, (info) => {
	console.log(`Backend listening on http://localhost:${info.port}`);
});
