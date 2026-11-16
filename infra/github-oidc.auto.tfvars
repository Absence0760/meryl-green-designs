# Non-secret, committed, loaded automatically by Terraform (the secret values
# stay in infra-secrets/meryl-green-designs/terraform.tfvars.sops).
#
# The exact OIDC `sub` prefix the deploy role trusts. Since the move into the
# jaredhoward-dev org (project-mgmt#14, 2026-11-16) the repo sends the
# immutable form repo:<org>@<org_id>/<repo>@<repo_id>, which a name-shaped
# repo:${github_repo} can't express. Read it, never build it:
#   gh api repos/jaredhoward-dev/meryl-green-designs/actions/oidc/customization/sub --jq .sub_claim_prefix
github_subject_prefix = "repo:jaredhoward-dev@357177875/meryl-green-designs@1194646030"
