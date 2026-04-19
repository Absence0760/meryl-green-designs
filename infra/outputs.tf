output "frontend_bucket_name" {
  description = "S3 bucket that hosts the built frontend. CI uploads to this bucket."
  value       = aws_s3_bucket.frontend.bucket
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID. CI uses this for cache invalidation."
  value       = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_domain_name" {
  description = "The *.cloudfront.net domain, useful while DNS is propagating."
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "lambda_function_name" {
  description = "Lambda function name. CI uses this to update the function code."
  value       = aws_lambda_function.backend.function_name
}

output "api_gateway_invoke_url" {
  description = "Direct invoke URL of the HTTP API (internal — use api_url for the public path through CloudFront)."
  value       = aws_apigatewayv2_api.backend.api_endpoint
}

output "api_url" {
  description = "Public base URL for the backend API, fronted by CloudFront. Set this as PUBLIC_API_URL when building the frontend."
  value       = "https://${var.domain_name}/api"
}

output "site_url" {
  description = "Public URL of the site."
  value       = "https://${var.domain_name}"
}

output "github_actions_role_arn" {
  description = "IAM role ARN that GitHub Actions assumes via OIDC. Copy this into the deploy workflows as AWS_ROLE_TO_ASSUME."
  value       = aws_iam_role.github_actions.arn
}
