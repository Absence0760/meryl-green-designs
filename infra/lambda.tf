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
  timeout = 10

  # 128 MB (the AWS default) throttles cold-start CPU enough that a Node 20
  # bundle with @sanity/client takes ~1s to initialise. AWS scales CPU
  # linearly with memory up to ~1792 MB, so 512 MB roughly halves cold starts
  # at the same per-ms price.
  memory_size = 512

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
      API_URL               = aws_lambda_function_url.backend.function_url
    }
  }

  depends_on = [aws_cloudwatch_log_group.lambda]

  lifecycle {
    ignore_changes = [
      filename,
      source_code_hash,
      last_modified,
    ]
  }
}

resource "aws_lambda_function_url" "backend" {
  function_name      = aws_lambda_function.backend.function_name
  authorization_type = "NONE"

  cors {
    allow_credentials = false
    allow_origins     = ["https://${var.domain_name}", "https://www.${var.domain_name}"]
    allow_methods     = ["POST", "GET", "OPTIONS"]
    allow_headers     = ["content-type"]
    max_age           = 600
  }
}
