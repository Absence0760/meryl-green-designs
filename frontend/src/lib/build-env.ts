// PUBLIC_* keys a production build must receive from its environment.
// PUBLIC_SANITY_PROJECT_ID is required too: a production site with no
// project ID would render every Sanity photo as a placeholder.
export const REQUIRED_PRODUCTION_ENV = [
	'PUBLIC_API_URL',
	'PUBLIC_SITE_URL',
	'PUBLIC_SANITY_PROJECT_ID'
] as const;

export function missingProductionEnv(env: Record<string, string | undefined>): string[] {
	return REQUIRED_PRODUCTION_ENV.filter((key) => !env[key]?.trim());
}
