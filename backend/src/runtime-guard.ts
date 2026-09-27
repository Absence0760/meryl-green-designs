// Fail-closed guard against local-dev configuration reaching the deployed
// Lambda. The committed backend/.env.development makes a fresh clone run
// offline (local content, file email, an obviously-dev admin token); none of
// those may ever be live in production. The Lambda's env comes only from
// Terraform (infra/lambda.tf), which never sets these, so this should never
// fire — it exists so a mistaken Terraform/console edit takes the API down
// loudly instead of serving sample content, swallowing customer email, or
// accepting a publicly-known admin token.
//
// Detection: AWS_LAMBDA_FUNCTION_NAME is set by the Lambda runtime itself
// (same signal as dynamo.ts assertSafeForRealAws).

export const DEV_ADMIN_API_TOKEN = 'local-dev-admin-token';

export function findDevOnlyConfig(env: NodeJS.ProcessEnv = process.env): string[] {
	const problems: string[] = [];
	if ((env.CONTENT_BACKEND ?? '').trim().toLowerCase() === 'local') {
		problems.push('CONTENT_BACKEND=local');
	}
	if ((env.EMAIL_BACKEND ?? '').trim().toLowerCase() === 'file') {
		problems.push('EMAIL_BACKEND=file');
	}
	if ((env.ADMIN_API_TOKEN ?? '').trim() === DEV_ADMIN_API_TOKEN) {
		problems.push('ADMIN_API_TOKEN is the committed local-dev token');
	}
	return problems;
}

export function assertNoDevConfigOnLambda(env: NodeJS.ProcessEnv = process.env): void {
	if (!env.AWS_LAMBDA_FUNCTION_NAME) return;
	const problems = findDevOnlyConfig(env);
	if (problems.length > 0) {
		throw new Error(
			`Refusing to start on Lambda with local-dev configuration: ${problems.join('; ')}. These values belong only in backend/.env.development — check the Lambda environment in infra/lambda.tf.`
		);
	}
}
