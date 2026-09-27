import { defineCliConfig } from 'sanity/cli';
import { requireStudioProjectId } from './project-env';

// Throws with a friendly "Studio is optional; here's how to set it up"
// message before `sanity dev` / `sanity build` get going.
const projectId = requireStudioProjectId(process.env.SANITY_STUDIO_PROJECT_ID);
const dataset = process.env.SANITY_STUDIO_DATASET || 'production';

export default defineCliConfig({
	api: {
		projectId,
		dataset
	},
	deployment: {
		appId: 'c6odt09sse78efy81sgwkyrp'
	}
});
