# ----------------------------------------------------------------------------
# PII retention sweep
#
# Monthly EventBridge schedule that invokes the existing backend Lambda with
# a synthetic scheduled event. The Lambda's dispatcher (backend/src/lambda.ts)
# detects `event.source == "aws.events"` and routes to runPiiCleanup() rather
# than the Hono HTTP handler.
#
# The cleanup walks Sanity for orders in a terminal state (`delivered` or
# `cancelled`) whose _updatedAt is older than 365 days, and nulls out the
# customer PII fields (name, email, phone, shipping address, customer notes,
# internal notes) while preserving accounting fields (orderRef, status,
# amountZar, paymentMethod, paymentId, _createdAt, items).
#
# See docs/security.md § PII retention for the policy and manual fallback.
# ----------------------------------------------------------------------------

resource "aws_cloudwatch_event_rule" "pii_cleanup" {
  name                = "${local.project}-pii-cleanup"
  description         = "Monthly PII retention sweep on order documents in Sanity"
  schedule_expression = "cron(0 4 1 * ? *)" # 04:00 UTC on the 1st of every month
  state               = "ENABLED"
}

resource "aws_cloudwatch_event_target" "pii_cleanup" {
  rule      = aws_cloudwatch_event_rule.pii_cleanup.name
  target_id = "${local.project}-backend-lambda"
  arn       = aws_lambda_function.backend.arn
}

resource "aws_lambda_permission" "pii_cleanup_invoke" {
  statement_id  = "AllowExecutionFromCloudWatchEvents"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.backend.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.pii_cleanup.arn
}
