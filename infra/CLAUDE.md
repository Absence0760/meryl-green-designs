# infra/

Terraform module for the AWS resources backing Meryl Green Designs:
- S3 + CloudFront for the static frontend (`s3_cloudfront.tf`)
- Lambda + API Gateway HTTP API for the backend, CloudFront `/api/*` → API Gateway → Lambda (`lambda.tf`, `api_gateway.tf`)
- ACM + Route 53 for DNS/TLS (in `s3_cloudfront.tf`)
- GitHub OIDC for CI auth (`github_oidc.tf`)
- DynamoDB for order PII (`dynamodb.tf`)
- **Auto-cancel Lambda + EventBridge daily cron** that flips stale `pending_payment` orders to `cancelled` (`auto_cancel.tf`). Separate Lambda function from the main backend, separate IAM role (Sanity write only — no DynamoDB / Resend / PayFast surface), separate CloudWatch log group. Carries its own CloudWatch alarms (Errors + no-recent-invocation) routed via an SNS topic to `ops_alerts_email` (falls back to `owner_email` when unset, so a separate operator inbox can absorb ops noise without changing the customer-facing owner address). Dropped EventBridge events land in an SQS DLQ.
- CloudWatch budget with email alerts (`budget.tf`)
- Security headers policy for CloudFront responses (`security_headers.tf`)

Not a pnpm workspace — no `package.json`.

## Hard rules

- **Never run `terraform apply` without explicit user confirmation.** `plan` is fine to run unprompted; `apply` is destructive in scope.
- **Never run `terraform destroy` without explicit user confirmation.**
- **OIDC only for CI auth.** Don't introduce long-lived AWS access keys. The GitHub Actions role (`github_oidc.tf`) is trust-policied to the `production` GitHub Actions environment of the configured repo (environment-scoped, not branch-scoped, so release-gated deploys with `refs/tags/<tag>` work).
- **Coordinate Terraform edits with `.github/workflows/` changes.** New IAM permissions, output values, or env vars often need matching workflow updates — make both edits in the same change.
- **Two-region setup is intentional.** Primary region is `af-south-1` (Cape Town); the ACM cert provider alias targets `us-east-1` because CloudFront requires its certs there. Don't try to consolidate.

## Workflow

Routine changes (env var added, log retention bumped, IAM scope tightened):

```bash
cd infra
terraform plan   # always; review the diff
# (then ask the user before applying)
terraform apply
```

The Lambda's environment variables are populated from `terraform.tfvars` — rotating a secret is `sops ../infra-secrets/meryl-green-designs/terraform.tfvars.sops` (the encrypted source lives in the sibling private repo), edit, save, then `terraform apply`. No code redeploy required.

## State

State lives in `s3://meryl-green-designs-tfstate` with DynamoDB locking. The bucket and lock table are created **once** by `bin/setup.sh` (Terraform can't bootstrap its own backend). Don't reconfigure the backend without good reason.

## CloudFront error mapping

`s3_cloudfront.tf` maps S3 404/403 responses to `/404.html` with HTTP **200** so the frontend's SPA fallback works for dynamic routes (`/shop/[slug]`). If you change `custom_error_response`, keep `response_code = 200` and `response_page_path = "/404.html"` or product detail pages will start returning 4xx.

## Releasing changes that include new infra

When a release adds a new AWS resource that a deploy workflow then
references (a new Lambda, etc.), **apply Terraform before publishing
the release**. `deploy-backend.yml` has a pre-flight `aws lambda
get-function` check on the auto-cancel Lambda; if you add another
Lambda, add a matching pre-flight check. Full release runbook:
`docs/deployment.md § Releasing changes that include new infra`.

## Pointers

- Module overview + bootstrap: `infra/README.md`
- Full deployment walkthrough: `docs/deployment.md`
- Secrets workflow (SOPS + KMS): `docs/deployment.md § Secrets management`
- What each output is used for: `docs/deployment.md § GitHub Actions variables`
