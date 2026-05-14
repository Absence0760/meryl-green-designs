# ----------------------------------------------------------------------------
# Daily auto-cancel Lambda
#
# Sweeps Sanity for orders left in `pending_payment` for longer than
# AUTO_CANCEL_DAYS (default 30, set below) and flips them to `cancelled`.
# Honors the commitment in /privacy that abandoned checkouts terminate
# instead of lingering forever. Code in backend/src/auto-cancel.ts +
# backend/src/auto-cancel-lambda.ts.
#
# Trust boundary: this Lambda needs Sanity write credentials but NO
# DynamoDB / Resend / PayFast access. Cancellation emails fire via the
# main backend Lambda when the Sanity status-change webhook re-enters
# the existing /webhooks/sanity-order path.
# ----------------------------------------------------------------------------

resource "aws_iam_role" "auto_cancel" {
  name = "${local.project}-auto-cancel-lambda"
  # Separate role from the main backend Lambda. The auto-cancel function
  # has a strictly smaller permission set (Sanity-only), so a compromised
  # auto-cancel runtime can't reach DynamoDB or the admin token.
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "auto_cancel_basic" {
  role       = aws_iam_role.auto_cancel.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_cloudwatch_log_group" "auto_cancel" {
  name              = "/aws/lambda/${local.project}-auto-cancel"
  retention_in_days = 30
}

data "archive_file" "auto_cancel_stub" {
  type        = "zip"
  output_path = "${path.module}/.terraform/auto_cancel_stub.zip"

  source {
    filename = "auto-cancel.mjs"
    content  = <<-EOT
      export const handler = async () => {
        console.log("auto-cancel placeholder — run the deploy-backend workflow");
        return { skipped: true };
      };
    EOT
  }
}

resource "aws_lambda_function" "auto_cancel" {
  function_name = "${local.project}-auto-cancel"
  role          = aws_iam_role.auto_cancel.arn

  filename         = data.archive_file.auto_cancel_stub.output_path
  source_code_hash = data.archive_file.auto_cancel_stub.output_base64sha256

  handler       = "auto-cancel.handler"
  runtime       = "nodejs22.x"
  architectures = ["arm64"]
  # 60s — the sweep is bounded by the count of stale orders (small for
  # this volume) plus per-order Sanity patch latency. Way under timeout
  # in practice, but daily jobs aren't latency-sensitive so the budget
  # absorbs any temporary Sanity slowness.
  timeout = 60

  # 256 MB — only does Sanity I/O, no AWS SDK calls, no large bundles.
  memory_size = 256

  environment {
    variables = {
      SANITY_PROJECT_ID = var.sanity_project_id
      SANITY_DATASET    = var.sanity_dataset
      SANITY_API_TOKEN  = var.sanity_api_token
      # Days threshold. Exposed as an env var so the value can be tuned
      # (e.g. shortened in staging) without redeploying the bundle.
      AUTO_CANCEL_DAYS = "30"
    }
  }

  depends_on = [aws_cloudwatch_log_group.auto_cancel]

  lifecycle {
    # The deploy-backend workflow uploads the real auto-cancel.zip on
    # release. Terraform never owns the code asset after first apply.
    ignore_changes = [
      filename,
      source_code_hash,
    ]

    prevent_destroy = true
  }
}

# ----------------------------------------------------------------------------
# EventBridge daily schedule (06:00 UTC == 08:00 SAST)
#
# Same UTC tide as the security workflow weekly sweeps (gitleaks /
# scorecard / pnpm audit / CodeQL) so all the background jobs land in
# one operational window.
# ----------------------------------------------------------------------------

resource "aws_cloudwatch_event_rule" "auto_cancel_daily" {
  name                = "${local.project}-auto-cancel-daily"
  description         = "Daily sweep that cancels pending_payment orders older than 30 days."
  schedule_expression = "cron(0 6 * * ? *)"
}

resource "aws_cloudwatch_event_target" "auto_cancel" {
  rule = aws_cloudwatch_event_rule.auto_cancel_daily.name
  arn  = aws_lambda_function.auto_cancel.arn
}

resource "aws_lambda_permission" "events_invoke_auto_cancel" {
  statement_id  = "AllowEventBridgeInvokeAutoCancel"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.auto_cancel.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.auto_cancel_daily.arn
}
