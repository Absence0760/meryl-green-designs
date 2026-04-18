# ----------------------------------------------------------------------------
# Lambda execution role (what the Lambda itself can do)
# ----------------------------------------------------------------------------

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${local.project}-backend-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# ----------------------------------------------------------------------------
# CloudWatch log group with a sensible retention period
# ----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${local.project}-backend"
  retention_in_days = 30
}

# ----------------------------------------------------------------------------
# Placeholder Lambda deployment package
#
# Terraform creates the Lambda function with a tiny stub. Real code is uploaded
# by the GitHub Actions deploy-backend workflow on every push. The `lifecycle`
# block below tells Terraform to ignore subsequent code changes so that `apply`
# doesn't fight with the deploy pipeline.
# ----------------------------------------------------------------------------

data "archive_file" "lambda_stub" {
  type        = "zip"
  output_path = "${path.module}/.terraform/lambda_stub.zip"

  source {
    filename = "lambda.mjs"
    content  = <<-EOT
      export const handler = async () => ({
        statusCode: 503,
        body: JSON.stringify({ error: "Backend not yet deployed. Run the GitHub Actions deploy-backend workflow." })
      });
    EOT
  }
}

resource "aws_lambda_function" "backend" {
  function_name = "${local.project}-backend"
  role          = aws_iam_role.lambda.arn

  filename         = data.archive_file.lambda_stub.output_path
  source_code_hash = data.archive_file.lambda_stub.output_base64sha256

  handler = "lambda.handler"
  runtime = "nodejs20.x"
  # 30s accommodates the monthly PII cleanup sweep (~60 sequential Sanity
  # patches on the first run, ~5/month thereafter — see pii-cleanup.ts).
  # HTTP request handlers complete in well under a second; the longer
  # timeout is dormant for those.
  timeout = 30

  # 128 MB (the AWS default) throttles cold-start CPU enough that a Node 20
  # bundle with @sanity/client takes ~1s to initialise. AWS scales CPU
  # linearly with memory up to ~1792 MB, so 512 MB roughly halves cold starts
  # at the same per-ms price.
  memory_size = 512

  # Cap concurrent invocations as a defence-in-depth complement to the
  # in-memory rate limiter (backend/src/rate-limit.ts). Without this,
  # a distributed attacker that bypasses per-IP limits could fan out to
  # the account-default 1000 concurrent Lambdas — each invocation calls
  # Sanity, which has its own quotas. See variables.tf for the rationale.
  reserved_concurrent_executions = var.lambda_reserved_concurrency

  environment {
    variables = {
      RESEND_API_KEY        = var.resend_api_key
      FROM_EMAIL            = var.from_email
      OWNER_EMAIL           = var.owner_email
      ALLOWED_ORIGINS       = "https://${var.domain_name},https://www.${var.domain_name}"
      SITE_URL              = var.site_url != "" ? var.site_url : "https://${var.domain_name}"
      SANITY_PROJECT_ID     = var.sanity_project_id
      SANITY_DATASET        = var.sanity_dataset
      SANITY_API_TOKEN      = var.sanity_api_token
      SANITY_WEBHOOK_SECRET = var.sanity_webhook_secret
      PAYFAST_MERCHANT_ID   = var.payfast_merchant_id
      PAYFAST_MERCHANT_KEY  = var.payfast_merchant_key
      PAYFAST_PASSPHRASE    = var.payfast_passphrase
      PAYFAST_SANDBOX       = var.payfast_sandbox
      # Backend's public base URL (CloudFront → API Gateway → Lambda) used
      # by the Hono app to build PayFast's notify_url. PayFast POSTs the
      # ITN callback to this URL, which reaches the Lambda through the
      # same /api/* path the browser uses.
      API_URL = var.site_url != "" ? "${var.site_url}/api" : "https://${var.domain_name}/api"
    }
  }

  depends_on = [aws_cloudwatch_log_group.lambda]

  lifecycle {
    ignore_changes = [
      filename,
      source_code_hash,
      last_modified,
    ]

    # Guard against accidental teardown. The Lambda holds the live backend
    # code uploaded by the deploy workflow — destroy would require a fresh
    # release deploy to restore. To genuinely tear down, set this to
    # `false`, apply, then run destroy.
    prevent_destroy = true
  }
}

# Lambda Function URL removed — see api_gateway.tf for the replacement.
# The Function URL feature hit an undiagnosable 403 at the gateway layer
# in this account + af-south-1 that affected both public and signed IAM
# traffic. API Gateway v2 HTTP API now fronts the Lambda.
