terraform {
  required_version = ">= 1.6.0"

  # Uncomment and fill in after creating the state bucket manually.
  # See infra/README.md for the one-time bootstrap steps.
  # backend "s3" {
  #   bucket         = "meryl-green-designs-tfstate"
  #   key            = "prod/terraform.tfstate"
  #   region         = "af-south-1"
  #   dynamodb_table = "meryl-green-designs-tfstate-lock"
  #   encrypt        = true
  # }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
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
