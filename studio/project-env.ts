// Shared by sanity.cli.ts (runs in the terminal when any `sanity` command
// starts) and sanity.config.ts (runs in the browser bundle), so a missing
// project ID fails fast with the same helpful message in both places.
//
// Sanity is a hosted content lake: the Studio can't run without a real
// project, and we don't fake one. It's optional for local dev — the site
// itself runs on the backend's local sample content.

export const MISSING_PROJECT_ID_MESSAGE = [
	'SANITY_STUDIO_PROJECT_ID is not set.',
	'',
	'The Studio is OPTIONAL for local dev: `pnpm dev`',
	'runs the site on local sample content, no Sanity.',
	'',
	'To use the Studio, create a free personal project',
	'at https://www.sanity.io/manage and add its ID to',
	'studio/.env.development.local:',
	'',
	'  SANITY_STUDIO_PROJECT_ID=<your project id>',
	'',
	'Details: docs/run-locally.md',
	'  § Sanity Studio (optional)'
].join('\n');

export function requireStudioProjectId(value: string | undefined): string {
	const projectId = value?.trim();
	if (!projectId) {
		throw new Error(MISSING_PROJECT_ID_MESSAGE);
	}
	return projectId;
}
