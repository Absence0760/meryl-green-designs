# ----------------------------------------------------------------------------
# Orders PII store
#
# Private DynamoDB table for customer PII on order documents (name, email,
# phone, shipping address, free-text notes, tracking info). The companion
# Sanity order document holds only non-PII fields (orderRef, status,
# amountZar, paymentMethod, paymentId) and joins to this table via orderRef.
#
# See docs/orders-pii-split-plan.md for the full architecture and migration
# plan. This file is the Phase 0 / Day 1 deliverable: the table exists but
# nothing reads or writes it until the dual-write backend deploy lands.
#
# Encryption uses the AWS-managed `aws/dynamodb` key (free, transparent to
# callers, no extra kms:* permissions needed on the Lambda role). The plan
# explains why we deliberately do NOT reuse the SOPS CMK.
# ----------------------------------------------------------------------------

resource "aws_dynamodb_table" "orders" {
  name         = "${local.project}-orders"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "orderRef"

  attribute {
    name = "orderRef"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
    # kms_key_arn omitted → uses the AWS-managed aws/dynamodb key.
  }

  lifecycle {
    # Customer PII lives here. A `terraform destroy` would silently wipe
    # every order's customer details. To genuinely tear down, flip this
    # to false, apply, then run destroy.
    prevent_destroy = true
  }
}

# ----------------------------------------------------------------------------
# Lambda IAM extension — CRUD on the orders table
#
# Scoped to the four actions the HTTP handlers actually use. The
# reconciler cron (Days 10–11 of docs/orders-pii-split-plan.md) will need
# dynamodb:Scan; re-add it in the same change that introduces the cron
# rather than leaving the permission latent in the meantime.
# No kms:* actions are needed because the AWS-managed aws/dynamodb key is
# transparent to the calling principal.
# ----------------------------------------------------------------------------

data "aws_iam_policy_document" "lambda_orders_dynamodb" {
  statement {
    sid = "OrdersTableAccess"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
    ]
    resources = [aws_dynamodb_table.orders.arn]
  }
}

resource "aws_iam_role_policy" "lambda_orders_dynamodb" {
  name   = "${local.project}-orders-dynamodb"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_orders_dynamodb.json
}
