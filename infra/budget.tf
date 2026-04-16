# ----------------------------------------------------------------------------
# Monthly cost budget with alerting
#
# A small e-commerce site at this scale should cost ~R15-30/month (mostly the
# Route 53 hosted zone). The budget below alerts when actual or forecast spend
# crosses 50%, 80%, and 100% of the configured cap, giving early warning of
# misconfiguration, attack-driven traffic spikes, or runaway log volume.
#
# Default cap is intentionally several times the expected baseline so normal
# month-to-month variance doesn't generate noise. Override via tfvars if you
# want a tighter or looser cap.
#
# AWS budgets are billed at $0.02/day per budget after the second budget
# (first two are free). One budget per account → free.
# ----------------------------------------------------------------------------

resource "aws_budgets_budget" "monthly" {
  name              = "${local.project}-monthly"
  budget_type       = "COST"
  limit_amount      = tostring(var.monthly_budget_usd)
  limit_unit        = "USD"
  time_unit         = "MONTHLY"
  time_period_start = "2026-01-01_00:00"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 50
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.owner_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.owner_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.owner_email]
  }

  # Forecast notification — alerts when AWS predicts you'll exceed the cap by
  # month-end, even if you haven't yet. Catches accelerating spend earlier.
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.owner_email]
  }
}
