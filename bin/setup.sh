#!/usr/bin/env bash
#
# setup.sh — one-command project bootstrap for AWS + GitHub + Sanity
#
# What this does (idempotent — safe to re-run):
#
#   1. Verifies required CLI tools are installed and authenticated
#   2. Parses infra/terraform.tfvars for the values it needs
#   3. Creates the Terraform state bucket + DynamoDB lock table if missing
#   4. Runs `terraform init` + `terraform apply` (after showing the plan)
#   5. Reads `terraform output -json` to get bucket names, ARNs, URLs
#   6. Creates the `production` GitHub Actions environment if missing
#   7. Populates all 8 GitHub environment variables via the `gh` CLI
#   8. (If SANITY_ADMIN_TOKEN is set) creates the backend Sanity webhook and
#      flips the dataset to Private
#   9. Prints a final checklist of the remaining manual steps (Resend
#      domain verification, content-rebuild webhook, etc.)
#
# Prerequisites:
#
#   - AWS CLI v2, authenticated (`aws sts get-caller-identity` must succeed)
#   - Terraform >= 1.6
#   - GitHub CLI (`gh`), authenticated (`gh auth status`)
#   - jq (JSON parser)
#   - af-south-1 region enabled in your AWS account
#   - infra/terraform.tfvars exists and is filled in
#
#   For Sanity automation (optional):
#   - SANITY_ADMIN_TOKEN env var set to a token from
#     https://www.sanity.io/manage → project → API → Tokens
#
# Usage:
#
#   ./bin/setup.sh          # normal run
#   ./bin/setup.sh --dry    # show what would happen, don't apply
#

set -euo pipefail

# ----------------------------------------------------------------------------
# Constants (matched to infra/main.tf backend config)
# ----------------------------------------------------------------------------

STATE_BUCKET="meryl-green-designs-tfstate"
LOCK_TABLE="meryl-green-designs-tfstate-lock"
STATE_KEY="prod/terraform.tfstate"
INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/infra"
TFVARS_FILE="$INFRA_DIR/terraform.tfvars"
TFVARS_SOPS_FILE="$INFRA_DIR/terraform.tfvars.sops"

DRY_RUN=0
if [[ "${1:-}" == "--dry" || "${1:-}" == "--dry-run" ]]; then
	DRY_RUN=1
fi

# Track whether we decrypted tfvars ourselves, so we only clean up a file we
# created (and don't shred a pre-existing plaintext tfvars the operator has
# been editing by hand).
DECRYPTED_TFVARS=0

# ----------------------------------------------------------------------------
# Output helpers
# ----------------------------------------------------------------------------

if [[ -t 1 ]]; then
	C_RESET=$'\033[0m'
	C_BOLD=$'\033[1m'
	C_DIM=$'\033[2m'
	C_GREEN=$'\033[32m'
	C_YELLOW=$'\033[33m'
	C_RED=$'\033[31m'
	C_BLUE=$'\033[34m'
else
	C_RESET=""; C_BOLD=""; C_DIM=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_BLUE=""
fi

step()  { printf "\n${C_BOLD}${C_BLUE}==> %s${C_RESET}\n" "$*"; }
log()   { printf "    %s\n" "$*"; }
ok()    { printf "    ${C_GREEN}✓${C_RESET} %s\n" "$*"; }
warn()  { printf "    ${C_YELLOW}!${C_RESET} %s\n" "$*" >&2; }
err()   { printf "    ${C_RED}✗${C_RESET} %s\n" "$*" >&2; }
fatal() { err "$*"; exit 1; }

cleanup() {
	# Shred any plaintext tfvars file we decrypted so it doesn't survive
	# this script invocation. Only runs if we created the file ourselves —
	# leaves a pre-existing plaintext tfvars (from before the SOPS migration)
	# alone.
	if (( DECRYPTED_TFVARS == 1 )) && [[ -f "$TFVARS_FILE" ]]; then
		rm -f "$TFVARS_FILE"
	fi
}
trap cleanup EXIT

trap 'err "Script failed at line $LINENO (see output above)"' ERR

# ----------------------------------------------------------------------------
# 1. Prerequisites
# ----------------------------------------------------------------------------

check_prereqs() {
	step "Checking prerequisites"

	local missing=0
	for tool in aws terraform gh jq curl sops; do
		if command -v "$tool" >/dev/null 2>&1; then
			ok "$tool is installed"
		else
			err "$tool is not installed"
			missing=1
		fi
	done
	(( missing == 0 )) || fatal "Install the missing tools and re-run."

	if aws sts get-caller-identity >/dev/null 2>&1; then
		ok "AWS CLI authenticated"
	else
		fatal "AWS CLI is not authenticated. Run: aws configure"
	fi

	if gh auth status >/dev/null 2>&1; then
		ok "GitHub CLI authenticated"
	else
		fatal "GitHub CLI is not authenticated. Run: gh auth login"
	fi

	ensure_plaintext_tfvars
}

# Make sure a plaintext terraform.tfvars exists for this script's run.
# Order of preference:
#   1. If a plaintext terraform.tfvars already exists, use it as-is (legacy
#      flow, no SOPS involved — operator will see a warning nudging them to
#      migrate).
#   2. If terraform.tfvars.sops exists, decrypt it into terraform.tfvars for
#      the duration of this script. The cleanup trap shreds the plaintext
#      on exit.
#   3. Otherwise, fail and tell the operator to run bin/sops-init.sh.
ensure_plaintext_tfvars() {
	if [[ -f "$TFVARS_FILE" && -f "$TFVARS_SOPS_FILE" ]]; then
		warn "Both $TFVARS_FILE (plaintext) and $TFVARS_SOPS_FILE exist."
		warn "Using the plaintext file and leaving it untouched."
		warn "Once you've migrated, delete the plaintext file so future runs"
		warn "decrypt from the SOPS copy instead."
		return
	fi

	if [[ -f "$TFVARS_FILE" ]]; then
		ok "$TFVARS_FILE exists (plaintext, pre-SOPS flow)"
		log "Consider migrating: bin/sops-init.sh then"
		log "  sops infra/terraform.tfvars.sops  # paste current values, save"
		log "  rm infra/terraform.tfvars         # remove the plaintext file"
		return
	fi

	if [[ -f "$TFVARS_SOPS_FILE" ]]; then
		log "Decrypting $TFVARS_SOPS_FILE..."
		if (( DRY_RUN )); then
			log "  [dry run] would decrypt to $TFVARS_FILE"
			# On a dry run we still need *something* to read — create an
			# empty file and let require_var() complain if fields are missing.
			touch "$TFVARS_FILE"
			DECRYPTED_TFVARS=1
			return
		fi
		sops --decrypt "$TFVARS_SOPS_FILE" > "$TFVARS_FILE"
		chmod 600 "$TFVARS_FILE"
		DECRYPTED_TFVARS=1
		ok "Decrypted to $TFVARS_FILE (will be shredded on exit)"
		return
	fi

	err "Neither $TFVARS_FILE nor $TFVARS_SOPS_FILE exists."
	log "Run bin/sops-init.sh first — it generates an age key, seeds an"
	log "encrypted tfvars from the example, and wires up .sops.yaml."
	exit 1
}

# ----------------------------------------------------------------------------
# 2. Parse terraform.tfvars
# ----------------------------------------------------------------------------

tfvar() {
	# Extract a simple `key = "value"` entry from terraform.tfvars.
	# Ignores comments and whitespace. Returns empty string if not found.
	grep -E "^[[:space:]]*$1[[:space:]]*=" "$TFVARS_FILE" \
		| head -1 \
		| sed -E 's/^[^=]+=[[:space:]]*//; s/^"//; s/"[[:space:]]*$//' \
		|| true
}

require_var() {
	local name=$1 value=$2
	if [[ -z "$value" ]]; then
		fatal "Required tfvar \"$name\" is empty — fill it in in $TFVARS_FILE"
	fi
}

read_tfvars() {
	step "Reading terraform.tfvars"

	AWS_REGION="$(tfvar aws_region)"
	AWS_REGION="${AWS_REGION:-af-south-1}"
	DOMAIN_NAME="$(tfvar domain_name)"
	GITHUB_REPO="$(tfvar github_repo)"
	SANITY_PROJECT_ID="$(tfvar sanity_project_id)"
	SANITY_DATASET="$(tfvar sanity_dataset)"
	SANITY_DATASET="${SANITY_DATASET:-production}"
	SANITY_WEBHOOK_SECRET="$(tfvar sanity_webhook_secret)"

	require_var domain_name "$DOMAIN_NAME"
	require_var github_repo "$GITHUB_REPO"
	require_var sanity_project_id "$SANITY_PROJECT_ID"

	log "Region:              $AWS_REGION"
	log "Domain:              $DOMAIN_NAME"
	log "GitHub repo:         $GITHUB_REPO"
	log "Sanity project:      $SANITY_PROJECT_ID"
	log "Sanity dataset:      $SANITY_DATASET"
}

# ----------------------------------------------------------------------------
# 3. Bootstrap Terraform state backend
# ----------------------------------------------------------------------------

bootstrap_state() {
	step "Bootstrapping Terraform state backend"

	if aws s3api head-bucket --bucket "$STATE_BUCKET" --region "$AWS_REGION" >/dev/null 2>&1; then
		ok "State bucket $STATE_BUCKET already exists"
	else
		log "Creating state bucket $STATE_BUCKET..."
		if (( DRY_RUN )); then
			log "  [dry run] skipped"
		else
			# us-east-1 rejects LocationConstraint; every other region requires it.
			if [[ "$AWS_REGION" == "us-east-1" ]]; then
				aws s3api create-bucket --bucket "$STATE_BUCKET" --region "$AWS_REGION"
			else
				aws s3api create-bucket \
					--bucket "$STATE_BUCKET" \
					--region "$AWS_REGION" \
					--create-bucket-configuration "LocationConstraint=$AWS_REGION"
			fi

			aws s3api put-bucket-versioning \
				--bucket "$STATE_BUCKET" \
				--versioning-configuration Status=Enabled

			aws s3api put-bucket-encryption \
				--bucket "$STATE_BUCKET" \
				--server-side-encryption-configuration \
					'{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

			aws s3api put-public-access-block \
				--bucket "$STATE_BUCKET" \
				--public-access-block-configuration \
					'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true'

			ok "State bucket created"
		fi
	fi

	if aws dynamodb describe-table --table-name "$LOCK_TABLE" --region "$AWS_REGION" >/dev/null 2>&1; then
		ok "Lock table $LOCK_TABLE already exists"
	else
		log "Creating lock table $LOCK_TABLE..."
		if (( DRY_RUN )); then
			log "  [dry run] skipped"
		else
			aws dynamodb create-table \
				--table-name "$LOCK_TABLE" \
				--attribute-definitions AttributeName=LockID,AttributeType=S \
				--key-schema AttributeName=LockID,KeyType=HASH \
				--billing-mode PAY_PER_REQUEST \
				--region "$AWS_REGION" >/dev/null

			aws dynamodb wait table-exists --table-name "$LOCK_TABLE" --region "$AWS_REGION"
			ok "Lock table created"
		fi
	fi
}

# ----------------------------------------------------------------------------
# 4. Terraform init + apply
# ----------------------------------------------------------------------------

apply_terraform() {
	step "Running terraform init + apply"

	pushd "$INFRA_DIR" >/dev/null

	log "terraform init..."
	terraform init -upgrade -input=false

	log "terraform plan..."
	terraform plan -out=.setup.tfplan -input=false

	if (( DRY_RUN )); then
		log "[dry run] skipping apply"
		rm -f .setup.tfplan
		popd >/dev/null
		return
	fi

	printf "\n    ${C_YELLOW}About to apply the plan above. Proceed? [y/N] ${C_RESET}"
	read -r confirm
	if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
		log "Aborted."
		rm -f .setup.tfplan
		popd >/dev/null
		exit 1
	fi

	log "terraform apply..."
	terraform apply -input=false .setup.tfplan
	rm -f .setup.tfplan

	popd >/dev/null
	ok "Terraform apply complete"
}

# ----------------------------------------------------------------------------
# 5. Read terraform outputs
# ----------------------------------------------------------------------------

read_outputs() {
	step "Reading terraform outputs"

	pushd "$INFRA_DIR" >/dev/null
	local outputs
	outputs="$(terraform output -json)"
	popd >/dev/null

	FRONTEND_BUCKET="$(echo "$outputs" | jq -r '.frontend_bucket_name.value')"
	CLOUDFRONT_DISTRIBUTION_ID="$(echo "$outputs" | jq -r '.cloudfront_distribution_id.value')"
	LAMBDA_FUNCTION_NAME="$(echo "$outputs" | jq -r '.lambda_function_name.value')"
	LAMBDA_FUNCTION_URL="$(echo "$outputs" | jq -r '.lambda_function_url.value')"
	GITHUB_ACTIONS_ROLE_ARN="$(echo "$outputs" | jq -r '.github_actions_role_arn.value')"

	# site_url comes from tfvars if set, otherwise defaults to https://<domain>
	SITE_URL="$(echo "$outputs" | jq -r '.site_url.value // empty')"
	if [[ -z "$SITE_URL" || "$SITE_URL" == "null" ]]; then
		SITE_URL="https://$DOMAIN_NAME"
	fi

	log "Frontend bucket:     $FRONTEND_BUCKET"
	log "CloudFront dist:     $CLOUDFRONT_DISTRIBUTION_ID"
	log "Lambda function:     $LAMBDA_FUNCTION_NAME"
	log "Lambda Function URL: $LAMBDA_FUNCTION_URL"
	log "Site URL:            $SITE_URL"
	log "GitHub Actions role: $GITHUB_ACTIONS_ROLE_ARN"
}

# ----------------------------------------------------------------------------
# 6 + 7. GitHub Actions environment + variables
# ----------------------------------------------------------------------------

populate_github() {
	step "Populating GitHub Actions environment variables"

	local env_name="production"

	if (( DRY_RUN )); then
		log "[dry run] would set variables on $GITHUB_REPO/$env_name"
		return
	fi

	# Create or update the environment (idempotent).
	gh api --silent -X PUT "repos/$GITHUB_REPO/environments/$env_name" || true

	set_var() {
		local name=$1 value=$2
		log "Setting $name"
		gh variable set "$name" \
			--env "$env_name" \
			--body "$value" \
			--repo "$GITHUB_REPO" >/dev/null
	}

	set_var AWS_REGION                 "$AWS_REGION"
	set_var AWS_ROLE_TO_ASSUME         "$GITHUB_ACTIONS_ROLE_ARN"
	set_var FRONTEND_BUCKET            "$FRONTEND_BUCKET"
	set_var CLOUDFRONT_DISTRIBUTION_ID "$CLOUDFRONT_DISTRIBUTION_ID"
	set_var LAMBDA_FUNCTION_NAME       "$LAMBDA_FUNCTION_NAME"
	set_var PUBLIC_API_URL             "$LAMBDA_FUNCTION_URL"
	set_var PUBLIC_SITE_URL            "$SITE_URL"
	set_var PUBLIC_SANITY_PROJECT_ID   "$SANITY_PROJECT_ID"
	set_var PUBLIC_SANITY_DATASET      "$SANITY_DATASET"

	ok "All GitHub Actions variables set"
}

# ----------------------------------------------------------------------------
# 8. Sanity webhook + dataset privacy (optional)
# ----------------------------------------------------------------------------

setup_sanity() {
	step "Setting up Sanity webhook + dataset privacy"

	if [[ -z "${SANITY_ADMIN_TOKEN:-}" ]]; then
		warn "SANITY_ADMIN_TOKEN env var is not set — skipping Sanity automation"
		log "To automate these steps, create a token at:"
		log "  https://www.sanity.io/manage → project → API → Tokens → Add API token"
		log "  (Permissions: Administrator)"
		log "Then re-run:"
		log "  SANITY_ADMIN_TOKEN=<token> ./bin/setup.sh"
		SANITY_AUTOMATED=0
		return
	fi

	if [[ -z "$SANITY_WEBHOOK_SECRET" ]]; then
		warn "sanity_webhook_secret is empty in terraform.tfvars — skipping webhook creation"
		log "Generate one with: openssl rand -hex 32"
		log "Paste into $TFVARS_FILE and re-run terraform apply + this script"
		SANITY_AUTOMATED=0
		return
	fi

	local api="https://api.sanity.io/v2021-06-07/projects/$SANITY_PROJECT_ID"
	local webhook_url="${LAMBDA_FUNCTION_URL%/}/webhooks/sanity-order"

	# ---- Flip dataset to private (idempotent) ----
	log "Setting dataset '$SANITY_DATASET' to private..."
	if (( DRY_RUN )); then
		log "  [dry run] skipped"
	else
		local response
		response="$(curl -fsS -X PATCH "$api/datasets/$SANITY_DATASET" \
			-H "Authorization: Bearer $SANITY_ADMIN_TOKEN" \
			-H "Content-Type: application/json" \
			-d '{"aclMode": "private"}' 2>&1)" || {
			err "Failed to flip dataset to private: $response"
			SANITY_AUTOMATED=0
			return
		}
		ok "Dataset set to private"
	fi

	# ---- Create backend webhook (check first, skip if exists) ----
	log "Checking for existing 'Order status email' webhook..."
	local existing_id=""
	if (( ! DRY_RUN )); then
		existing_id="$(curl -fsS -H "Authorization: Bearer $SANITY_ADMIN_TOKEN" \
			"$api/hooks" \
			| jq -r '.[] | select(.name == "Order status email") | .id' \
			|| true)"
	fi

	if [[ -n "$existing_id" ]]; then
		ok "Webhook already exists (id=$existing_id), leaving untouched"
	else
		log "Creating webhook pointing at $webhook_url"
		if (( DRY_RUN )); then
			log "  [dry run] skipped"
		else
			local body
			body="$(jq -n \
				--arg url "$webhook_url" \
				--arg dataset "$SANITY_DATASET" \
				--arg secret "$SANITY_WEBHOOK_SECRET" \
				'{
					name: "Order status email",
					description: "Sends customer the matching email when an order status changes",
					url: $url,
					dataset: $dataset,
					type: "document",
					rule: {
						on: ["update"],
						filter: "_type == \"order\" && delta::changedAny(status)",
						projection: ""
					},
					httpMethod: "POST",
					apiVersion: "v2024-10-01",
					secret: $secret,
					isDisabled: false
				}')"

			curl -fsS -X POST "$api/hooks" \
				-H "Authorization: Bearer $SANITY_ADMIN_TOKEN" \
				-H "Content-Type: application/json" \
				-d "$body" >/dev/null
			ok "Backend webhook created"
		fi
	fi

	SANITY_AUTOMATED=1
}

# ----------------------------------------------------------------------------
# 9. Final checklist
# ----------------------------------------------------------------------------

print_checklist() {
	step "Setup complete — remaining manual steps"

	cat <<EOF

${C_BOLD}What's done:${C_RESET}
  ✓ AWS infrastructure (S3, CloudFront, Lambda, IAM, Route 53)
  ✓ GitHub Actions 'production' environment + 8 variables
EOF

	if [[ "${SANITY_AUTOMATED:-0}" == "1" ]]; then
		cat <<EOF
  ✓ Sanity 'production' dataset set to private
  ✓ Backend webhook created (order status emails)
EOF
	fi

	cat <<EOF

${C_BOLD}What still needs you (can't be automated):${C_RESET}

  1. ${C_BOLD}Verify your Resend sending domain${C_RESET} at https://resend.com/domains
     (DNS records at your registrar, wait for verification)

  2. ${C_BOLD}Create a Sanity 'Deploy Studio' token for CI${C_RESET}:
     https://www.sanity.io/manage → project → API → Tokens → Add API token
     • Name: github-actions-studio-deploy
     • Permissions: Deploy Studio
     This is a DIFFERENT token from SANITY_ADMIN_TOKEN (which you already
     used to run this script). This one has 'Deploy Studio' scope only.
     Add it as a GitHub Actions secret named SANITY_AUTH_TOKEN (the env
     var name the Sanity CLI looks for in CI):
       gh secret set SANITY_AUTH_TOKEN \\
         --env production \\
         --body '<paste deploy-studio token>' \\
         --repo $GITHUB_REPO

  3. ${C_BOLD}Create the content-rebuild Sanity webhook${C_RESET}:
     This webhook needs a GitHub fine-grained PAT in its auth header, which
     can't be pulled from the local gh CLI. See docs/deployment.md step 9
     "Webhook A" for the dashboard walkthrough.

  4. ${C_BOLD}First deploys${C_RESET}:
       gh workflow run deploy-frontend.yml --repo $GITHUB_REPO
       gh workflow run deploy-backend.yml --repo $GITHUB_REPO
     (These will auto-run on every future push to main.)

  5. ${C_BOLD}First Sanity Studio deploy${C_RESET} (one-time interactive):
       pnpm studio deploy

  6. ${C_BOLD}Add content${C_RESET} in Sanity Studio — products, gallery photos.

${C_BOLD}Site URL:${C_RESET}            https://$DOMAIN_NAME
${C_BOLD}Lambda Function URL:${C_RESET} $LAMBDA_FUNCTION_URL
${C_BOLD}GitHub env vars:${C_RESET}     https://github.com/$GITHUB_REPO/settings/environments/production

EOF
}

# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------

main() {
	if (( DRY_RUN )); then
		warn "Running in DRY RUN mode — no changes will be applied"
	fi
	check_prereqs
	read_tfvars
	bootstrap_state
	apply_terraform
	read_outputs
	populate_github
	setup_sanity
	print_checklist
}

main "$@"
