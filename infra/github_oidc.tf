# ----------------------------------------------------------------------------
# GitHub OIDC provider
#
# This is a one-per-account resource. If another project in the same AWS
# account has already created it, import it instead of creating a duplicate:
#   terraform import aws_iam_openid_connect_provider.github \
#     arn:aws:iam::<account-id>:oidc-provider/token.actions.githubusercontent.com
# ----------------------------------------------------------------------------

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

# ----------------------------------------------------------------------------
# Trust policy: only workflows running in the `production` GitHub environment
# of the configured repo may assume this role. Environment-scoped (not branch-
# scoped) because release-gated deploys run with github.ref=refs/tags/<tag>,
# not refs/heads/main — so a branch-based trust policy would reject them.
# The `production` environment is created by bin/setup.sh and carries the
# deploy variables; workflows declare `environment: production` explicitly.
#
# Org move (Absence0760/project-mgmt#14): transferring the repo into a GitHub
# organization changes the `sub` prefix (a repo transferred after 2026-07-15
# issues `repo:<org>@<org_id>/<repo>@<repo_id>`). The role trusts a list of
# exact subjects, `repo:${var.github_repo}` plus `github_extra_subject_prefixes`,
# still StringEquals. Before the transfer, add the post-transfer prefix as an
# extra and apply. After it, set `github_repo` to the new `<org>/<repo>` (which
# drops the old Absence0760 subject) and keep the ID-shaped new prefix as the
# one extra: a name-shaped primary cannot express it. With no extras the trust
# is unchanged. Read a prefix, never build it:
#   gh api repos/<owner>/<repo>/actions/oidc/customization/sub --jq .sub_claim_prefix
# ----------------------------------------------------------------------------

locals {
  # Primary first, then the org-move extras; distinct() so a repeated primary
  # cannot duplicate a subject.
  github_subject_prefixes = distinct(concat(
    ["repo:${var.github_repo}"],
    var.github_extra_subject_prefixes,
  ))
}

data "aws_iam_policy_document" "github_actions_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [for p in local.github_subject_prefixes : "${p}:environment:production"]
    }
  }
}

resource "aws_iam_role" "github_actions" {
  name               = "${local.project}-github-actions"
  assume_role_policy = data.aws_iam_policy_document.github_actions_trust.json
}

# ----------------------------------------------------------------------------
# Permissions: S3 put/list for the frontend bucket, CloudFront invalidation
# for the distribution, Lambda update for the backend function.
#
# Scoped as tightly as possible to specific resource ARNs.
# ----------------------------------------------------------------------------

data "aws_iam_policy_document" "github_actions_permissions" {
  statement {
    sid = "FrontendBucketWrite"
    actions = [
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:GetObject",
      "s3:ListBucket",
    ]
    resources = [
      aws_s3_bucket.frontend.arn,
      "${aws_s3_bucket.frontend.arn}/*",
    ]
  }

  statement {
    sid       = "CloudFrontInvalidation"
    actions   = ["cloudfront:CreateInvalidation"]
    resources = [aws_cloudfront_distribution.frontend.arn]
  }

  statement {
    sid = "LambdaUpdate"
    actions = [
      "lambda:UpdateFunctionCode",
      "lambda:GetFunction",
    ]
    # Both the main backend Lambda and the daily auto-cancel Lambda are
    # code-deployed by the same workflow (deploy-backend.yml).
    resources = [
      aws_lambda_function.backend.arn,
      aws_lambda_function.auto_cancel.arn,
    ]
  }
}

resource "aws_iam_role_policy" "github_actions" {
  name   = "${local.project}-github-actions-deploy"
  role   = aws_iam_role.github_actions.id
  policy = data.aws_iam_policy_document.github_actions_permissions.json
}
