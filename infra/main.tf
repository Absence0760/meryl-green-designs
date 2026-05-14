terraform {
  required_version = ">= 1.6.0, < 2.0.0"

  # State backend values are hardcoded because terraform backend blocks
  # can't reference variables. The state bucket and lock table are created
  # by bin/setup.sh on first run — if you run `terraform init` before the
  # script, you'll see a "bucket does not exist" error, which is the hint
  # to run the setup script instead.
  backend "s3" {
    bucket         = "meryl-green-designs-tfstate"
    key            = "prod/terraform.tfstate"
    region         = "af-south-1"
    dynamodb_table = "meryl-green-designs-tfstate-lock"
    encrypt        = true
  }

  required_providers {
    aws = {
      source = "hashicorp/aws"
      # Provider v6 — major bump from v5 done 2026-05-14. Survey:
      #   - aws_cloudfront_response_headers_policy.etag is now
      #     computed-only (we never set it; no edit needed).
      #   - aws_s3_bucket exposes `bucket_region` alongside the
      #     repurposed `region` arg. We read neither; no edit needed.
      #   - No state migrations required for our resource set —
      #     none of the v6 forced-re-imports (api_gateway_deployment
      #     v1, appflow, cognito_user_in_group, sagemaker_image_version,
      #     redshift snapshot_copy/logging) are in our infra.
      # See https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/version-6-upgrade
      version = "~> 6.45"
    }
  }
}

# Primary region — where the Lambda, DynamoDB lock table, and state bucket live.
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "meryl-green-designs"
      ManagedBy   = "terraform"
      Environment = "production"
    }
  }
}

# CloudFront requires its ACM certificate to live in us-east-1, regardless of
# where the rest of the infrastructure lives.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "meryl-green-designs"
      ManagedBy   = "terraform"
      Environment = "production"
    }
  }
}

locals {
  project = "meryl-green-designs"
}
