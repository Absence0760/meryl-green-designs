variable "aws_region" {
  description = "Primary AWS region for Lambda, DynamoDB, and S3 resources."
  type        = string
  default     = "af-south-1"
}

variable "domain_name" {
  description = "Apex domain for the site, e.g. merylgreendesigns.co.za"
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
  description = "Address that receives new-order notifications."
  type        = string
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
