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
  description = "Sanity project ID — used at frontend build time via PUBLIC_SANITY_PROJECT_ID."
  type        = string
}

variable "sanity_dataset" {
  description = "Sanity dataset name."
  type        = string
  default     = "production"
}
