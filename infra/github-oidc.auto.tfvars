# Non-secret, committed, loaded automatically by Terraform (the secret values
# stay in infra-secrets/meryl-green-designs/terraform.tfvars.sops).
#
# Org move (Absence0760/project-mgmt#14): the repo moves to the jaredhoward-dev
# org (ID 357177875). A repo transferred after 2026-07-15 sends the immutable
# subject repo:<org>@<org_id>/<repo>@<repo_id>; the repo ID doesn't change.
# The trust's primary subject is name-shaped (repo:${github_repo}), so this
# form can only ever be an extra: keep it after the transfer, and switch
# github_repo to jaredhoward-dev/meryl-green-designs then. Confirm the real
# prefix after the transfer:
#   gh api repos/jaredhoward-dev/meryl-green-designs/actions/oidc/customization/sub --jq .sub_claim_prefix
github_extra_subject_prefixes = ["repo:jaredhoward-dev@357177875/meryl-green-designs@1194646030"]
