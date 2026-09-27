import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { visionTool } from '@sanity/vision';
import { schemaTypes } from './schemas';

import { requireStudioProjectId } from './project-env';

const projectId = requireStudioProjectId(process.env.SANITY_STUDIO_PROJECT_ID);
const dataset = process.env.SANITY_STUDIO_DATASET || 'production';

export default defineConfig({
	name: 'meryl-green-designs',
	title: 'Meryl Green Designs',
	projectId,
	dataset,
	plugins: [structureTool(), visionTool()],
	schema: {
		types: schemaTypes
	}
});
