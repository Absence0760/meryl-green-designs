variable "aws_region" {
  description = "Primary AWS region for Lambda, DynamoDB, and S3 resources."
  type        = string
  default     = "af-south-1"
}

variable "domain_name" {
  description = "Apex domain for the site, e.g. merylgreendesigns.com"
  type        = string
}

variable "route53_zone_id" {
  description = <<-EOT
    ID of the Route 53 hosted zone for the apex domain. The zone must already
    exist — Terraform will add records to it but will not create it. Look it up
    with: aws route53 list-hosted-zones-by-name --dns-name <domain>
  EOT
  type        = string
}

variable "github_repo" {
  description = "GitHub repository in 'owner/name' form, used to scope the OIDC trust policy."
  type        = string
}

variable "resend_api_key" {
  description = "Resend API key used by the backend to send order emails."
  type        = string
  sensitive   = true
}

variable "from_email" {
  description = "The 'From' address on outgoing order emails. Must be a verified Resend sender."
  type        = string
}

variable "owner_email" {
  description = "Address that receives new-order notifications + AWS Budget alerts. Typically the business owner."
  type        = string
}

variable "ops_alerts_email" {
  description = <<-EOT
    Address that receives operational CloudWatch alarm emails (auto-cancel
    Lambda errors, missed daily-cron invocations). Typically the developer /
    operator, not the business owner — alarm bodies are AWS metric JSON that
    isn't actionable for a non-technical recipient.

    Optional. Leaves blank, defaults to `owner_email`. Use a '+tag' alias
    (e.g. you+ops-alerts@gmail.com) so you can filter them in your inbox.
  EOT
  type        = string
  default     = ""
}

variable "sanity_project_id" {
  description = "Sanity project ID — used at frontend build time via PUBLIC_SANITY_PROJECT_ID, and by the backend to read/write order documents."
  type        = string
}

variable "sanity_dataset" {
  description = "Sanity dataset name."
  type        = string
  default     = "production"
}

variable "sanity_api_token" {
  description = "Sanity API token with write access to the `order` document type. Used by the backend to create order documents when customers submit the form."
  type        = string
  sensitive   = true
}

variable "sanity_webhook_secret" {
  description = "Shared secret used to verify Sanity webhook signatures when Sanity calls /webhooks/sanity-order. Generate with `openssl rand -hex 32` and paste the same value into the Sanity webhook configuration."
  type        = string
  sensitive   = true
}

variable "site_url" {
  description = "Public URL of the site. Baked into confirmation emails as the base for tracking links. Defaults to https://<domain_name>."
  type        = string
  default     = ""
}

# --- PayFast payment gateway ---

variable "payfast_merchant_id" {
  description = "PayFast merchant ID. Get this from your PayFast dashboard after registration."
  type        = string
  sensitive   = true
  default     = ""
}

variable "payfast_merchant_key" {
  description = "PayFast merchant key."
  type        = string
  sensitive   = true
  default     = ""
}

variable "payfast_passphrase" {
  description = "PayFast passphrase for signature generation and ITN verification."
  type        = string
  sensitive   = true
  default     = ""
}

variable "payfast_sandbox" {
  description = <<-EOT
    "true" routes the backend at PayFast's sandbox endpoint; "false"
    goes live to the configured merchant. Default is "true" — to
    accept real payments you must explicitly set this to "false" in
    the encrypted tfvars (../infra-secrets/meryl-green-designs/terraform.tfvars.sops).
    The conservative default prevents a stale
    or partial tfvars file from silently flipping the Lambda into
    live-payments mode after a `terraform apply`.
  EOT
  type        = string
  default     = "true"

  validation {
    condition     = contains(["true", "false"], var.payfast_sandbox)
    error_message = "payfast_sandbox must be the literal string \"true\" or \"false\"."
  }
}

# --- Admin / Studio integration (Phase 0 orders-PII-split) ---

variable "admin_api_token" {
  description = <<-EOT
    Bearer token guarding the /admin/* routes that power the Sanity
    Studio custom panels for order PII. Generate with `openssl rand
    -hex 32`. Must match the ADMIN_API_TOKEN GitHub Actions secret in
    the `production` environment — deploy-studio.yml re-exports it as
    SANITY_STUDIO_ADMIN_TOKEN at build time and bakes it into the
    Studio JS bundle so the panels can call the API.

    The token is baked into the Studio bundle and therefore readable
    by anyone who inspects the bundle — the backend bearer-token check
    (constant-time compare in middleware/admin-auth.ts) is the actual
    security gate, not the secrecy of this value. Rotate alongside the
    Studio deploy if you suspect leakage.
  EOT
  type        = string
  sensitive   = true
  default     = ""
}

variable "studio_origins" {
  description = <<-EOT
    Comma-separated list of origins permitted to call /admin/* on the
    Lambda. Tighter than ALLOWED_ORIGINS — only the Studio's deployed
    URL should be on this list. Example:
    "https://meryl-green-designs.sanity.studio".

    Empty string disables admin-route CORS entirely (admin routes still
    work for direct API calls bearing the token; the browser-side
    Studio just can't reach them). The bearer-token check is the real
    gate; this CORS scope is defence-in-depth — see backend/src/app.ts.
  EOT
  type        = string
  default     = ""
}

# --- Monthly budget alerts ---

variable "lambda_reserved_concurrency" {
  description = <<-EOT
    Cap on concurrent invocations of the backend Lambda. Default 20 is well
    above expected organic load (this site sees a handful of orders per
    week) but caps blast radius if an attacker bypasses the in-memory
    rate limiter. Setting to -1 removes the cap and falls back to the
    account default (1000 in af-south-1).
  EOT
  type        = number
  default     = 20
}

variable "monthly_budget_usd" {
  description = <<-EOT
    Monthly AWS spend cap (USD) used for budget-alert thresholds. The budget
    fires email alerts to owner_email at 50%, 80%, and 100% of actual spend,
    plus a forecast alert when AWS predicts month-end spend will exceed the
    cap. The expected baseline for this project is ~$1-2/month, so the
    default of $30 is several multiples of expected spend — a tripped alert
    means something is genuinely wrong.
  EOT
  type        = number
  default     = 30
}
