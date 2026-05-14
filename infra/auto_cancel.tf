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

  # Dropped events (after the default 2 retries) land in the DLQ
  # defined below. The CloudWatch alarms on the Lambda's Invocations
  # metric will fire well before the DLQ becomes interesting, but the
  # queue means operators can re-fire a missed sweep manually instead
  # of waiting 24h for the next scheduled run.
  dead_letter_config {
    arn = aws_sqs_queue.auto_cancel_dlq.arn
  }
}

resource "aws_lambda_permission" "events_invoke_auto_cancel" {
  statement_id  = "AllowEventBridgeInvokeAutoCancel"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.auto_cancel.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.auto_cancel_daily.arn
}

# ----------------------------------------------------------------------------
# Operational alerting (audit M-2)
#
# The daily auto-cancel job has no customer-facing feedback loop — if it
# silently fails (missing env var, Sanity outage, cold-start exception),
# abandoned orders pile up in `pending_payment` past the policy's 30-day
# promise. Two alarms cover the gap:
#   1. Errors > 0 over any one-hour window — the Lambda's own crashes.
#   2. Invocations == 0 over a 26-hour window — EventBridge missed
#      firing, or the rule was disabled. 26h > 24h cron interval so a
#      single missed invocation crosses the threshold once we're
#      definitely outside the schedule's nominal window.
#
# Both alarms publish to a single SNS topic that emails the owner.
# AWS SNS email subscriptions need a one-time confirmation click — the
# owner gets a `Subscription Confirmation` email on first apply.
# ----------------------------------------------------------------------------

resource "aws_sns_topic" "ops_alerts" {
  name = "${local.project}-ops-alerts"

  # Server-side encryption with the AWS-managed `aws/sns` key.
  # Topic payloads are alarm metadata (function name + period + count)
  # — no PII — but Trivy flags any unencrypted SNS topic by default
  # (AVD-AWS-0095). Enabling AWS-managed encryption costs nothing,
  # clears the finding, and keeps the at-rest defence parity with
  # the other resources in this module (DynamoDB, SQS DLQ).
  kms_master_key_id = "alias/aws/sns"
}

resource "aws_sns_topic_subscription" "ops_alerts_owner" {
  topic_arn = aws_sns_topic.ops_alerts.arn
  protocol  = "email"
  endpoint  = var.owner_email
}

resource "aws_cloudwatch_metric_alarm" "auto_cancel_errors" {
  alarm_name          = "${local.project}-auto-cancel-errors"
  alarm_description   = "Daily auto-cancel Lambda errored at least once in the last hour."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 3600
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.auto_cancel.function_name
  }

  alarm_actions = [aws_sns_topic.ops_alerts.arn]
  ok_actions    = [aws_sns_topic.ops_alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "auto_cancel_no_recent_invocation" {
  alarm_name          = "${local.project}-auto-cancel-no-recent-invocation"
  alarm_description   = "Daily auto-cancel Lambda has not been invoked in the last 24h — EventBridge rule may be disabled or missing target."
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Invocations"
  namespace           = "AWS/Lambda"
  # CloudWatch caps `period × evaluation_periods` at 86400 seconds.
  # With evaluation_periods=1, the max usable period is 86400 (24h).
  # An earlier draft set this to 26 * 3600 to buy slack; PutMetricAlarm
  # rejects that as invalid. The 24h window is sufficient: the cron
  # publishes Invocations into a UTC-aligned bucket each day, so the
  # most recent complete bucket reflects yesterday's run.
  period             = 86400
  statistic          = "Sum"
  threshold          = 1
  treat_missing_data = "breaching"

  dimensions = {
    FunctionName = aws_lambda_function.auto_cancel.function_name
  }

  alarm_actions = [aws_sns_topic.ops_alerts.arn]
  ok_actions    = [aws_sns_topic.ops_alerts.arn]
}

# ----------------------------------------------------------------------------
# Dead-letter queue for the EventBridge target (audit L-2)
#
# EventBridge's default retry policy for Lambda targets is two retries
# over 24h; if both retries fail, the event is silently dropped. A DLQ
# captures the dropped events so the operator can notice and (rarely)
# re-fire them.
#
# Recovery path: in practice, the CloudWatch alarm on Invocations < 1
# fires before the DLQ becomes interesting; the right response is
# "re-enable / re-target the EventBridge rule in the AWS console and
# wait for the next 06:00 UTC tick", not "drain the DLQ". If you DO
# need to inspect the DLQ contents, use the AWS console with your
# admin credentials — the GitHub Actions deploy role intentionally
# does NOT have sqs:ReceiveMessage on this queue because no automated
# path needs to read it.
# ----------------------------------------------------------------------------

resource "aws_sqs_queue" "auto_cancel_dlq" {
  name = "${local.project}-auto-cancel-dlq"

  # 14 days — SQS's maximum retention. Two weeks is comfortably longer
  # than any operator triage window for a missed cron run; anything
  # older than that is no longer operationally interesting (the
  # CloudWatch alarm above would have already fired).
  message_retention_seconds = 14 * 24 * 60 * 60

  # Server-side encryption with the AWS-managed key — Trivy flags
  # plaintext SQS as a finding. CMK would be the next step up if we
  # ever needed customer-managed key rotation; the AWS-managed key
  # is the right default for an ops queue at this scale.
  sqs_managed_sse_enabled = true
}

# IAM policy permitting EventBridge to push dropped events to the SQS DLQ.
data "aws_iam_policy_document" "auto_cancel_dlq_policy" {
  statement {
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.auto_cancel_dlq.arn]

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_cloudwatch_event_rule.auto_cancel_daily.arn]
    }
  }
}

resource "aws_sqs_queue_policy" "auto_cancel_dlq" {
  queue_url = aws_sqs_queue.auto_cancel_dlq.id
  policy    = data.aws_iam_policy_document.auto_cancel_dlq_policy.json
}
