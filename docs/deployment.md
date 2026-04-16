# Deployment

This document is the operational guide for getting Meryl Green Designs from a
fresh clone to a live site, and keeping it running afterwards.

For the conceptual picture of how the pieces fit together, see
[`architecture.md`](./architecture.md).

## Contents

1. [What gets deployed where](#what-gets-deployed-where)
2. [Fastest path: `bin/setup.sh`](#fastest-path-binsetupsh)
3. [The full setup flow](#the-full-setup-flow)
4. [Prerequisites](#prerequisites)
5. [Step-by-step first-time setup](#step-by-step-first-time-setup)
6. [End-to-end verification](#end-to-end-verification)
7. [Environment variable reference](#environment-variable-reference)
8. [Ongoing deployments](#ongoing-deployments)
9. [Rollback](#rollback)
10. [Adding a new content type](#adding-a-new-content-type)
11. [Cost expectations](#cost-expectations)
12. [Tearing everything down](#tearing-everything-down)
13. [Troubleshooting](#troubleshooting)
14. [Appendix A: Understanding what `bin/setup.sh` does](#appendix-a-understanding-what-binsetupsh-does)

## What gets deployed where

| App | Target | Trigger |
|---|---|---|
| Frontend | S3 + CloudFront (AWS) | `deploy-frontend.yml` on **release published** (+ `repository_dispatch` for Sanity content edits) |
| Backend | Lambda + Function URL (AWS) | `deploy-backend.yml` on **release published** |
| Studio | Sanity hosted (`*.sanity.studio`) | `deploy-studio.yml` on **release published** |

All three deploys are **release-gated**: they fire only when a GitHub release
is published, not on every push to `main`. Cutting a release is an explicit
act, so each production change has a version tag, release notes, and a clear
rollback target. See [Ongoing deployments](#ongoing-deployments) below for
the release workflow.

The frontend also listens for `repository_dispatch: sanity-publish` so that
content edits Meryl makes in the Studio trigger a rebuild of the static site
without requiring a code release.

All three deploys expose `workflow_dispatch` as an escape hatch — you can
manually re-run any deploy from the Actions tab (useful for hotfixes, flaky
AWS API retries, or re-shipping the current `main` without cutting a new
release).

Infrastructure (S3 bucket, CloudFront, Lambda, IAM, Route 53, ACM certificate,
GitHub OIDC provider + CI role) is managed by Terraform in `infra/`. GitHub
Actions workflows in `.github/workflows/` deploy code on top of that
infrastructure. The two are decoupled: Terraform creates the resources,
workflows update them.

### SPA fallback for dynamic routes

The frontend uses `@sveltejs/adapter-static` with `fallback: '404.html'`
configured in `frontend/svelte.config.js`. The build produces a `404.html`
page that contains the SPA shell — when a user visits a client-only
dynamic route like `/shop/[slug]` directly, it boots, reads the URL, and
renders the correct product page.

For this to work in production, CloudFront's custom error responses in
`infra/s3_cloudfront.tf` must route 404s (and 403s, since S3 returns 403
for missing objects when listing is disabled) to `/404.html` with HTTP
status **200**. Returning 404 at the HTTP layer for a valid product URL
would hurt SEO, trip 4xx alarms, and confuse crawlers. Terraform
currently configures this correctly — if you change the error-response
block, make sure `response_code` stays 200 and `response_page_path`
stays `/404.html`, or the product detail pages break.

## Fastest path: `bin/setup.sh`

If you have the [prerequisites](#prerequisites) installed and authenticated,
the entire AWS + GitHub Actions + Sanity setup is **one command**:

```bash
# Recommended: dry-run first to check prereqs and preview what will happen
./bin/setup.sh --dry

# Then the real run:
SANITY_ADMIN_TOKEN=<token> ./bin/setup.sh
```

The script is **idempotent** — safe to re-run. Every step checks whether its
target resource already exists and skips creation if so. If it fails partway
through (network blip, expired AWS credentials, etc.), fix the issue and run
it again; it will pick up where it left off.

**What it automates:**

1. Verifies `aws`, `terraform`, `gh`, `jq`, `curl` are installed and that
   `aws` + `gh` are authenticated
2. Parses `infra/terraform.tfvars` for the values it needs
3. Creates the Terraform state S3 bucket + DynamoDB lock table (first run only)
4. Runs `terraform init` → `terraform plan` → interactive `apply` prompt
5. Reads outputs from `terraform output -json`
6. Creates the `production` GitHub Actions environment
7. Populates all 8 GitHub Actions **variables** from the Terraform outputs
8. *(if `SANITY_ADMIN_TOKEN` is set)* Flips the Sanity dataset to private
9. *(if `SANITY_ADMIN_TOKEN` is set)* Creates the backend webhook for order
   status emails (idempotent: skips if a webhook with the same name exists)
10. Prints a final checklist of the remaining manual steps

**What it does NOT automate** (because it genuinely can't):

- Creating accounts at AWS, Sanity, Resend
- Verifying your Resend sending domain (DNS records at your registrar)
- Enabling the `af-south-1` region in your AWS account (opt-in regions require
  a one-time click in the AWS console)
- Creating the content-rebuild Sanity webhook (needs a fine-grained GitHub PAT
  that can't be pulled from your local `gh` CLI — see step 4 below)
- First interactive Sanity Studio deploy (`pnpm studio deploy`)
- Adding the `SANITY_AUTH_TOKEN` GitHub Actions secret for CI studio deploys
- Entering initial content in the studio

Detailed step-by-step with these manual parts interleaved is in
[§ Step-by-step first-time setup](#step-by-step-first-time-setup). If you want
to understand what the script is doing under the hood, see
[Appendix A](#appendix-a-understanding-what-binsetupsh-does).

## The full setup flow

```
┌──────────────────────────────────────────────────────────────────────┐
│  ONE-TIME EXTERNAL SETUP          (cannot be automated — ~20 min)    │
├──────────────────────────────────────────────────────────────────────┤
│  1. AWS account                                                      │
│  2. Enable af-south-1 region (opt-in regions need manual activation) │
│  3. Domain registered + Route 53 hosted zone                         │
│  4. Sanity account + project                                         │
│  5. Resend account + verified sending domain                         │
│  6. Install CLI tools: terraform, aws, gh, jq                        │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│  CONFIGURE                                           (~5 min)        │
├──────────────────────────────────────────────────────────────────────┤
│  ./bin/sops-init.sh                                                  │
│  sops infra/terraform.tfvars.sops   (fill in values in $EDITOR)      │
│  sops backend/.env.sops             (same for local-dev secrets)     │
│                                                                      │
│  sops-init.sh generates an age keypair at                            │
│  ~/.config/sops/age/keys.txt (one-time), wires the public recipient  │
│  into .sops.yaml, and seeds encrypted files from the examples.       │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│  RUN THE SCRIPT                                      (~15 min)       │
├──────────────────────────────────────────────────────────────────────┤
│  ./bin/setup.sh --dry                                                │
│  SANITY_ADMIN_TOKEN=<token> ./bin/setup.sh                           │
│                                                                      │
│  (Most of the 15 min is CloudFront propagation during terraform      │
│  apply — there's no way to speed that up, it's on AWS's side.)       │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│  MANUAL WRAP-UP                                      (~15 min)       │
├──────────────────────────────────────────────────────────────────────┤
│  1. First interactive studio deploy: pnpm studio deploy              │
│  2. Create content-rebuild Sanity webhook (dashboard, needs GH PAT)  │
│  3. Add SANITY_AUTH_TOKEN GitHub Actions secret                      │
│  4. Trigger first GitHub Actions deploys                             │
│  5. Add initial content in Sanity Studio                             │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│  VERIFY                                               (~5 min)       │
├──────────────────────────────────────────────────────────────────────┤
│  See § End-to-end verification                                       │
└──────────────────────────────────────────────────────────────────────┘
```

## Prerequisites

### External accounts

- **AWS** — a root or IAM-user account with permission to create S3, IAM,
  Lambda, CloudFront, Route 53, ACM, and DynamoDB resources
- **Sanity** — free account at [sanity.io/manage](https://www.sanity.io/manage),
  with a project created (the project ID will be your
  `PUBLIC_SANITY_PROJECT_ID`). Leave the dataset public for now — the script
  will flip it to private later
- **Resend** — free account at [resend.com](https://resend.com), with your
  sending domain added and DNS records verified. Takes 5-30 minutes depending
  on DNS propagation
- **Domain name** — registered with any registrar; it must be resolvable via a
  Route 53 hosted zone. If your registrar isn't Route 53, create the zone in
  Route 53 first and update the registrar's nameservers

### AWS account settings

- **`af-south-1` region enabled**. Cape Town is an opt-in region and requires
  a one-time manual activation. Go to AWS Console → top-right account menu →
  Account → AWS Regions → Enable *Africa (Cape Town)*. Takes ~5 minutes for
  the region to become available.

### Tools on your machine

- [Terraform](https://developer.hashicorp.com/terraform/downloads) ≥ 1.6
- [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
  — run `aws configure` with credentials that can do everything above
- [GitHub CLI](https://cli.github.com/) (`gh`) — run `gh auth login`
- [`jq`](https://jqlang.github.io/jq/download/) — JSON parser
- `curl` (usually pre-installed)

The setup script fails fast with clear messages if any of these are missing
or not authenticated, so you'll know quickly.

## Step-by-step first-time setup

### Step 1. Create external accounts (if you don't have them)

Work through the [Prerequisites](#prerequisites) list. You can start the
Resend domain verification while you're doing the rest — the DNS propagation
wait is often the longest individual step.

### Step 2. Configure Terraform variables

```bash
cp infra/terraform.tfvars.example infra/terraform.tfvars
$EDITOR infra/terraform.tfvars
```

Required values:

| Variable | Where to get it |
|---|---|
| `domain_name` | Your apex domain, e.g. `merylgreendesigns.co.za` (no protocol, no trailing slash) |
| `route53_zone_id` | `aws route53 list-hosted-zones-by-name --dns-name <your-domain>` → copy the `Id` without the `/hostedzone/` prefix |
| `github_repo` | Your repo in `owner/name` form, e.g. `jaredhoward/meryl-green-designs` |
| `resend_api_key` | Resend dashboard → API Keys → Create API key → copy the value |
| `from_email` | A verified sender on your Resend domain, e.g. `"Meryl Green Designs <orders@merylgreendesigns.co.za>"` |
| `owner_email` | Inbox that should receive new-order notifications |
| `sanity_project_id` | Sanity dashboard → your project → top of the page |
| `sanity_api_token` | Sanity → Project → API → Tokens → Add → `Editor` role (used by the Lambda at runtime to create orders and read documents) |
| `sanity_webhook_secret` | Generate with `openssl rand -hex 32`. Store this somewhere — the setup script reuses it when creating the Sanity webhook |
| `site_url` | Optional. Defaults to `https://<domain_name>`. Only set this if you want tracking links in emails to point elsewhere |

`aws_region` and `sanity_dataset` have sensible defaults (`af-south-1` and
`production` respectively) and can be left as-is.

### Step 3. Create the Sanity admin token

This is a **different token from the one in step 2** — the `sanity_api_token`
above is used by the Lambda at runtime, and has `Editor` scope (can
read/write documents). The token you're about to create is used only by
`bin/setup.sh` on your machine, and needs `Administrator` scope (can create
webhooks and change dataset privacy).

1. Sanity dashboard → project → **API → Tokens → Add API token**
2. Name: `setup-script-admin`
3. Permissions: **Administrator**
4. Copy the value. You'll use it as an environment variable in the next step,
   and can safely delete it afterwards if you want

If you skip this step, the script will still run, but it'll leave the Sanity
dataset public and won't create the order-status webhook. You can run it
again later with the token set.

### Step 4. Run the setup script

```bash
# Preview without changing anything:
./bin/setup.sh --dry

# Real run:
SANITY_ADMIN_TOKEN=<paste token from step 3> ./bin/setup.sh
```

The script will:

- Check every prerequisite and bail with a clear error if anything's missing
- Echo back the values it parsed from `terraform.tfvars` for you to confirm
- Create the state bucket + lock table (first run only)
- Run `terraform plan` and show it to you, then prompt `[y/N]` before applying
- Wait ~15 minutes for CloudFront to propagate (nearly all of the apply time
  is on AWS's side, not yours)
- Read the Terraform outputs and populate the GitHub Actions environment
- Flip the Sanity dataset to private and create the backend webhook
- Print the final checklist for the remaining manual steps (step 5 onward)

If you hit an error, fix the cause and re-run. The script is idempotent and
will skip anything that's already done.

### Step 5. First Sanity Studio deploy (interactive, one-time)

```bash
cp studio/.env.example studio/.env
# Fill in SANITY_STUDIO_PROJECT_ID with your project ID
pnpm studio exec sanity login     # opens browser for Sanity SSO
pnpm studio deploy                # pick a subdomain when prompted, e.g. "merylgreendesigns"
```

This publishes the studio to `https://<subdomain>.sanity.studio`. Share that
URL with Meryl (after inviting her to the project in Sanity's dashboard).
Subsequent studio deploys are handled automatically by the
`deploy-studio.yml` workflow on pushes that touch `studio/`.

### Step 6. Add the `SANITY_AUTH_TOKEN` GitHub Actions secret

This token is used by the `deploy-studio.yml` workflow to publish studio
changes in CI. It needs **Deploy Studio** scope only — it's not the same as
`SANITY_ADMIN_TOKEN` from step 3.

1. Sanity dashboard → project → **API → Tokens → Add API token**
2. Name: `github-actions-studio-deploy`
3. Permissions: **Deploy Studio**
4. Copy the value, then:

```bash
gh secret set SANITY_AUTH_TOKEN \
  --env production \
  --body '<paste deploy-studio token>' \
  --repo <your owner>/<your repo>
```

The name `SANITY_AUTH_TOKEN` is what Sanity's own CLI reads from the
environment — don't rename it.

### Step 7. Create the content-rebuild Sanity webhook

This is the only webhook the setup script can't create, because it needs a
GitHub fine-grained PAT in its Authorization header, and your local `gh` CLI
token doesn't have the right scopes to be safely reused.

1. **Create the fine-grained PAT** at
   [github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta):
   - **Repository access**: Only select `<your owner>/<your repo>`
   - **Repository permissions**: **Contents: Read and write**
   - **Expiration**: 1 year
   - Copy the token

2. **Create the webhook** at
   [sanity.io/manage](https://www.sanity.io/manage) → project →
   **API → Webhooks → Create webhook**:

| Field | Value |
|---|---|
| Name | `Rebuild site on publish` |
| Description | Triggers frontend redeploy via GitHub Actions |
| URL | `https://api.github.com/repos/<your owner>/<your repo>/dispatches` |
| Dataset | `production` |
| Trigger on | Create, Update, Delete |
| Filter (GROQ) | `_type == "product" \|\| _type == "galleryPhoto"` |
| HTTP method | `POST` |
| HTTP header: Authorization | `Bearer <paste PAT from step 1>` |
| HTTP header: Accept | `application/vnd.github+json` |
| HTTP header: X-GitHub-Api-Version | `2022-11-28` |
| HTTP body | `{"event_type": "sanity-publish"}` |
| Enabled | yes |

3. Save the webhook. Test it by editing a product and clicking Publish — a
   **Deploy frontend** workflow run should start within a few seconds.

### Step 8. Trigger the first deploys

Now that everything is configured, kick off the first runs of each workflow:

```bash
gh workflow run deploy-frontend.yml --repo <your owner>/<your repo>
gh workflow run deploy-backend.yml  --repo <your owner>/<your repo>
```

Watch them in the GitHub Actions UI (or `gh run list`). Each should take
~2 minutes. After both complete, move on to verification.

### Step 9. Add initial content

Open `https://<subdomain>.sanity.studio` in a browser, log in, and create at
least one product and one gallery photo so you can verify the full flow.
Click **Publish** on each document you create.

## End-to-end verification

Run these checks after setup is complete. If any fail, see
[Troubleshooting](#troubleshooting).

### 1. Frontend is reachable

```bash
curl -I https://<your-domain>
# Expect: HTTP/2 200, content-type: text/html
```

Then open the site in a browser and click through Home, Gallery, Shop,
Track, Contact. Every page should render without console errors.

### 2. Backend health check

```bash
curl https://<lambda-url>/health
# Expect: {"ok":true}
```

The Lambda URL is in your Terraform outputs
(`terraform output lambda_function_url`) or the GitHub Actions
`PUBLIC_API_URL` variable.

### 3. Products and gallery load live

With your browser devtools **Network** tab open, visit `/shop`. You should
see a fetch to `<lambda-url>/products` returning your real products. Same for
`/gallery` → `<lambda-url>/gallery`.

### 4. Full order flow

1. On the live site's `/shop` page, click **Enquire / Order** on a product
2. Scroll to the order form, fill it in with a real email you control, submit
3. Within ~10 seconds you should receive:
   - The owner notification email at `owner_email`
   - The customer confirmation email at the address you entered, containing
     the tracking link
4. Click the tracking link in the email. The `/track` page should load with
   your order status as "Pending payment"
5. Open Sanity Studio, find the new order document, change status to
   "Payment received", click **Publish**
6. Within ~10 seconds you should receive the payment-received email
7. Refresh the `/track` page — it should show the new status

If all seven steps work, the full flow is live end-to-end.

### 5. Content rebuild on publish

Edit a product in the studio (change the name or price), click **Publish**.
Within ~60 seconds a new **Deploy frontend** workflow run should appear in
GitHub Actions, and the change should be visible on the live site.

## Secrets management (SOPS + AWS KMS)

Secrets live in the repo as SOPS-encrypted files. A project-dedicated AWS
KMS key (alias `alias/meryl-green-designs-sops` in `af-south-1`) is the
encryption root — anyone with `kms:Decrypt` permission on that key can read
the encrypted files. Access is bound to AWS IAM rather than a file on disk,
so laptop loss is fully recoverable: a new machine + `aws configure` + the
same AWS identity gets you back in. The KMS key costs ~$1/month.

### What's encrypted, what isn't

| File | Encrypted? | Why |
|---|---|---|
| `infra/terraform.tfvars.sops` | ✅ yes | Committed. Contains the AWS + Resend + Sanity secrets Terraform needs. |
| `infra/terraform.tfvars` | — | Plaintext, gitignored. Created by `bin/setup.sh` as a scratch file, shredded on exit. |
| `infra/terraform.tfvars.example` | ❌ no | Template with empty placeholder values — safe to commit. |
| `backend/.env.sops` | ✅ yes | Committed. Local-dev secrets for `tsx` / `pnpm dev`. |
| `backend/.env` | — | Plaintext, gitignored. Created by the operator via `sops -d backend/.env.sops > backend/.env`. |
| `backend/.env.example` | ❌ no | Template — safe to commit. |
| `frontend/.env`, `studio/.env` | ❌ no | Only contain `PUBLIC_*` vars / project IDs — non-secret by SvelteKit convention. |

### First-time setup

```bash
./bin/sops-init.sh
```

The script is idempotent. It:

1. Checks that `sops`, `aws`, and `jq` are installed.
2. Verifies you're authenticated to AWS (`aws sts get-caller-identity`).
3. Checks whether the project's KMS alias (`alias/meryl-green-designs-sops`) already exists. If it does, the existing key is reused; if not, a new KMS key is created with annual automatic key-material rotation enabled, tagged with `project=meryl-green-designs`.
4. Writes the key's alias ARN into `.sops.yaml`, replacing the placeholder.
5. Seeds `infra/terraform.tfvars.sops` and `backend/.env.sops` from the example files, encrypted under the KMS key.
6. Prints next steps.

Re-running the script after first setup is safe: it will not create a duplicate KMS key (it reuses the alias), will not overwrite a populated `.sops.yaml`, and will not overwrite existing encrypted files. Each step has an explicit "already exists" short-circuit.

**There is no key file to back up.** Your AWS account IS the backup. If you lose your laptop, install `sops` + `awscli` on a new machine, `aws configure` with your existing credentials, clone the repo, and `sops infra/terraform.tfvars.sops` works immediately.

### Environment overrides

`bin/sops-init.sh` accepts two environment overrides for edge cases:

| Variable | Default | Use when |
|---|---|---|
| `KMS_REGION` | `af-south-1` | You want the KMS key in a different AWS region (e.g. to co-locate with other infrastructure) |
| `KMS_ALIAS` | `meryl-green-designs-sops` | You want to reuse an existing KMS alias from a different name — e.g. to share one key across all your projects. **Default of one-key-per-project is recommended** for blast-radius isolation. |

### Daily workflow

| Action | Command |
|---|---|
| Edit a secret | `sops infra/terraform.tfvars.sops` — sops calls KMS, opens plaintext in `$EDITOR`, re-encrypts on save |
| Rotate a value | Same as "edit" — change the value, save. Git diff shows the whole encrypted blob changed; `git log` tells you when. |
| Read a secret into dev env | `sops -d backend/.env.sops > backend/.env` |
| Run Terraform locally | `./bin/setup.sh` — it auto-decrypts `terraform.tfvars.sops` into a scratch plaintext file, runs Terraform, and shreds the plaintext on exit |
| Add a collaborator | Grant their IAM identity `kms:Decrypt` (and optionally `kms:Encrypt`) on the KMS key — either via the key policy in the AWS console or by attaching an IAM policy to their user/role. **No changes to `.sops.yaml` and no re-encryption required.** IAM is the source of truth for access. |
| Remove a collaborator | Revoke their `kms:Decrypt` permission in the key policy or their IAM policy. Takes effect immediately on the next decrypt attempt. |

### Access model

Decryption requires two things:

1. **AWS credentials** that are allowed `kms:Decrypt` on the alias `alias/meryl-green-designs-sops` (or the key it resolves to). The default key policy created by `bin/sops-init.sh` grants the AWS account root user full access, and AWS IAM users/roles in the account inherit permissions per their attached policies.
2. **Network access** to the AWS KMS API in the key's region (`af-south-1` by default).

No key material ever leaves AWS. SOPS passes the encrypted data encryption key (DEK) to KMS, KMS decrypts the DEK under the customer master key (CMK), and SOPS uses the plaintext DEK to decrypt the file contents locally. Neither the CMK material nor the plaintext DEK is stored on disk.

### Audit trail

Every `kms:Decrypt` call against the project's KMS key is logged in **CloudTrail**. To see who has been accessing secrets:

```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=Decrypt \
  --region af-south-1 \
  --max-results 20
```

…filtered down to this project's key by inspecting the `resources.ARN` field. If you suspect a leaked credential, CloudTrail tells you when it was last used.

### Rotating a secret value

Same as editing it: `sops infra/terraform.tfvars.sops`, change the value, save. For Terraform-managed secrets, remember to run `./bin/setup.sh` (or `cd infra && terraform apply`) afterwards to push the new value to the Lambda's environment variables.

### Rotating the KMS key

Two different things, easy to confuse:

1. **Automatic key-material rotation** is already enabled. AWS automatically generates a new key material every 365 days while keeping the same key ID and alias. Your encrypted files keep working unchanged — CloudTrail records the rotation event, nothing else changes. No action required.
2. **Manual key replacement** — you want a fresh KMS key (e.g. after a suspected compromise). Create a new key, update the alias to point at it, and re-encrypt every SOPS file under the new key material:

   ```bash
   aws kms create-key --region af-south-1 \
     --description "SOPS secrets encryption for meryl-green-designs (rotated)"
   # → note the new KeyId
   aws kms update-alias --region af-south-1 \
     --alias-name alias/meryl-green-designs-sops \
     --target-key-id <new-key-id>
   sops updatekeys infra/terraform.tfvars.sops
   sops updatekeys backend/.env.sops
   ```

   The old key can be scheduled for deletion with `aws kms schedule-key-deletion --pending-window-in-days 7` once you've verified the new one works.

### Partial-failure recovery during first-time setup

If `bin/sops-init.sh` fails after creating the KMS key but before creating the alias (e.g. your network dropped mid-run, or the alias-create call errored), you'll have an **orphan KMS key** — a new key with no alias pointing at it. The next run of the script won't find the alias, so it won't reuse the orphan; it'll create a second key instead. You don't want two keys.

To recover:

1. **List your KMS keys** and find the most recent one that has no alias:

   ```bash
   aws kms list-keys --region af-south-1 --query 'Keys[*].KeyId' --output text
   # For each key ID, check its tags:
   aws kms list-resource-tags --region af-south-1 --key-id <key-id>
   ```

   The orphan will be tagged `project=meryl-green-designs purpose=sops-secrets` (from `bin/sops-init.sh`) but have no `alias/meryl-green-designs-sops` pointing at it.

2. **Either attach the expected alias** to the orphan key:

   ```bash
   aws kms create-alias \
     --region af-south-1 \
     --alias-name alias/meryl-green-designs-sops \
     --target-key-id <orphan-key-id>
   ```

   Then re-run `./bin/sops-init.sh` — it'll find the alias, reuse the key, and finish the setup cleanly.

3. **Or schedule the orphan for deletion** and let `bin/sops-init.sh` create a fresh one:

   ```bash
   aws kms schedule-key-deletion \
     --region af-south-1 \
     --key-id <orphan-key-id> \
     --pending-window-in-days 7
   ./bin/sops-init.sh
   ```

   Note the 7-day minimum pending-deletion window — you'll be billed ~$0.23 for the orphan until it's actually deleted. Trivial but annoying.

### Recovery scenarios

- **Lost your laptop.** Install `sops` + `awscli` on a new machine, run `aws configure` with your existing AWS credentials, clone the repo, done. There is no key file to restore.
- **Lost your AWS credentials too.** Recover AWS account access via the usual AWS account recovery process (email, MFA reset, whatever auth factors you enabled). Once logged back in, `aws configure` a new access key and you're back in business.
- **Lost your AWS account entirely** (closed, compromised, etc.). The encrypted files in git are then unrecoverable by you. Regenerate every secret from its source dashboard (Resend, Sanity), create a new AWS account, run `bin/sops-init.sh` to create a fresh KMS key and re-seed the encrypted files with the new values. See `docs/security.md § Incident playbook`.
- **Suspect a secret value has leaked** (not the KMS key itself). Rotate the secret in its source dashboard, update it via `sops infra/terraform.tfvars.sops`, run `terraform apply`. SOPS encryption doesn't rotate the secret values themselves — it only controls who can read the file.

## Environment variable reference

All the environment variables used by the three apps, in one place.

### Backend Lambda runtime env

Set by Terraform (from `infra/terraform.tfvars`) → `aws_lambda_function`
environment block. Update by editing tfvars and re-running `terraform apply`.

| Variable | Source | Purpose |
|---|---|---|
| `RESEND_API_KEY` | tfvars `resend_api_key` | Resend API authentication |
| `FROM_EMAIL` | tfvars `from_email` | Sender address on outgoing emails |
| `OWNER_EMAIL` | tfvars `owner_email` | Where new-order notifications go |
| `ALLOWED_ORIGINS` | derived from tfvars `domain_name` | CORS allow-list (apex + www) |
| `SITE_URL` | tfvars `site_url` (defaults to `https://<domain>`) | Base URL for tracking links in emails |
| `SANITY_PROJECT_ID` | tfvars `sanity_project_id` | Which Sanity project to read/write |
| `SANITY_DATASET` | tfvars `sanity_dataset` (default `production`) | Which dataset |
| `SANITY_API_TOKEN` | tfvars `sanity_api_token` | Runtime Sanity client auth (Editor scope) |
| `SANITY_WEBHOOK_SECRET` | tfvars `sanity_webhook_secret` | Shared HMAC secret for verifying Sanity webhook signatures |
| `PAYFAST_MERCHANT_ID` | tfvars `payfast_merchant_id` | PayFast merchant ID |
| `PAYFAST_MERCHANT_KEY` | tfvars `payfast_merchant_key` | PayFast merchant key (sensitive) |
| `PAYFAST_PASSPHRASE` | tfvars `payfast_passphrase` | PayFast signature passphrase (sensitive) |
| `PAYFAST_SANDBOX` | tfvars `payfast_sandbox` | `'true'` for sandbox, `'false'` for production |
| `API_URL` | derived from Lambda Function URL | Backend URL for PayFast ITN notify_url |

### Frontend build-time env

Set by GitHub Actions from the `production` environment → populated by
`bin/setup.sh` from Terraform outputs. Baked into the JS bundle at build
time; rebuilding is required to change them.

| Variable | Source |
|---|---|
| `PUBLIC_API_URL` | `lambda_function_url` Terraform output |
| `PUBLIC_SITE_URL` | tfvars `site_url` (e.g. `https://merylgreendesigns.co.za`) — used to build absolute Open Graph / Twitter Card URLs |
| `PUBLIC_SANITY_PROJECT_ID` | tfvars `sanity_project_id` |
| `PUBLIC_SANITY_DATASET` | tfvars `sanity_dataset` |

### GitHub Actions variables (the `production` environment)

All populated automatically by `bin/setup.sh`.

| Variable | From | Used by |
|---|---|---|
| `AWS_REGION` | tfvars `aws_region` | All three deploy workflows (`configure-aws-credentials`) |
| `AWS_ROLE_TO_ASSUME` | TF output `github_actions_role_arn` | All three deploy workflows (OIDC role assumption) |
| `FRONTEND_BUCKET` | TF output `frontend_bucket_name` | `deploy-frontend.yml` (S3 sync target) |
| `CLOUDFRONT_DISTRIBUTION_ID` | TF output `cloudfront_distribution_id` | `deploy-frontend.yml` (invalidation) |
| `LAMBDA_FUNCTION_NAME` | TF output `lambda_function_name` | `deploy-backend.yml` (update-function-code) |
| `PUBLIC_API_URL` | TF output `lambda_function_url` | `deploy-frontend.yml` (build env) |
| `PUBLIC_SANITY_PROJECT_ID` | tfvars `sanity_project_id` | `deploy-frontend.yml` + `deploy-studio.yml` |
| `PUBLIC_SANITY_DATASET` | tfvars `sanity_dataset` | `deploy-frontend.yml` + `deploy-studio.yml` |

### GitHub Actions secrets (the `production` environment)

Set manually in step 6 of the setup.

| Secret | Scope | Used by |
|---|---|---|
| `SANITY_AUTH_TOKEN` | Deploy Studio | `deploy-studio.yml` (runs `sanity deploy`) |

### Local development (not production)

- `frontend/.env` — `PUBLIC_API_URL`, `PUBLIC_SANITY_PROJECT_ID`, `PUBLIC_SANITY_DATASET`
- `backend/.env` — same as Lambda runtime env above, plus `PORT=3001`
- `studio/.env` — `SANITY_STUDIO_PROJECT_ID`, `SANITY_STUDIO_DATASET`

See [`run-locally.md`](./run-locally.md) for local dev setup.

### Token summary (the tricky one)

There are **four** Sanity-related tokens. They serve different purposes
and have different names for good reasons — don't conflate them.

| Name | Where it lives | Scope | Used by |
|---|---|---|---|
| `sanity_api_token` (tfvars) → `SANITY_API_TOKEN` (Lambda env) | Encrypted Terraform state + Lambda env | Editor (read + write documents) | Backend runtime: creates orders, reads products/gallery, reads orders |
| `SANITY_ADMIN_TOKEN` | Your shell environment, only while running `bin/setup.sh` | Administrator (manage webhooks, change dataset privacy) | Setup script only; not stored anywhere after the run |
| `SANITY_AUTH_TOKEN` (GitHub Actions secret) | GitHub repo secrets (`production` env) | Deploy Studio | `deploy-studio.yml` — runs `sanity deploy` in CI |
| GitHub fine-grained PAT | Sanity webhook HTTP header | GitHub repo Contents: write | Sanity's content-rebuild webhook, to trigger `repository_dispatch` on the GitHub Actions workflow |

## Ongoing deployments

After first-time setup, deployments are **release-gated**. Pushing code to
`main` runs CI (typecheck + tests via `ci.yml`) but does **not** trigger any
production deploy. Production ships only when you publish a GitHub release.

### TL;DR

```bash
git push origin main                                    # just runs CI
gh release create v0.1.0 --generate-notes --target main # triggers all 3 deploys
```

Bump the version (`v0.1.0` → `v0.1.1`, etc.) each time. Everything else on
this page is context and edge cases.

### The release flow

1. Merge your changes into `main`. CI runs on every push + PR.
2. Cut a release — either via the `gh` CLI or in the GitHub UI:

   ```bash
   # Example: tag v0.3.1 on the current main and publish the release
   gh release create v0.3.1 --generate-notes --target main
   ```

3. Publishing the release fires all three deploy workflows in parallel:
   - `deploy-frontend.yml` — rebuilds the static site, syncs to S3, invalidates CloudFront
   - `deploy-backend.yml` — rebuilds the Lambda bundle, updates `$LATEST`
   - `deploy-studio.yml` — re-publishes the Sanity Studio

   Each workflow has a **check → deploy** structure. The check job compares
   the current release tag against the previous release tag using
   `git diff --name-only`, scoped to that workspace's paths
   (`backend/**`, `frontend/**`, `studio/**`, plus `pnpm-lock.yaml` and the
   workflow file itself). If nothing relevant changed, the deploy job is
   skipped and appears as "skipped" in the Actions UI — no CloudFront
   invalidation, no Lambda update, no Sanity redeploy.

   **Manual dispatch** (`workflow_dispatch`) and **Sanity content rebuilds**
   (`repository_dispatch: sanity-publish`, frontend only) always deploy —
   the skip logic is bypassed, since manual operator intent and
   content-out-of-git changes are not detectable by a file diff.

   A single release tag still governs all three workspaces — this is
   lockstep with an optimization, not per-app release trains. If the
   frontend didn't change since the last release, publishing a backend
   hotfix release will only redeploy the backend.

4. Watch the Actions tab until the three check jobs complete and their
   deploy jobs either run or skip. Spot-check the live site if anything
   actually changed.

### Triggers summary

| When this happens | What gets deployed | How it's triggered |
|---|---|---|
| PR opened or push to `main`/`dev` | Nothing is deployed; CI runs `pnpm check` + `pnpm test` | `ci.yml` |
| GitHub release is published | Frontend + backend + studio workflows each run a `check` job; only the workspaces whose files changed since the previous release actually deploy | `release: types: [published]` on each deploy workflow, with an early-exit check job |
| You click "Run workflow" in the Actions tab | That single workflow re-runs against the current `main` | `workflow_dispatch` |
| Meryl publishes a product or gallery photo in Studio | Frontend rebuild (no release required — content changes shouldn't need a version tag) | Sanity webhook → `repository_dispatch: sanity-publish` → `deploy-frontend.yml` |
| Meryl changes an order's status in Studio | Customer status email sent (payment received / shipped / delivered / cancelled) | Sanity webhook → backend `/webhooks/sanity-order` route → Resend |
| You edit `infra/terraform.tfvars` (e.g. rotating `RESEND_API_KEY`) | Lambda env vars update in place | `cd infra && terraform apply` |

### Why release-gated?

- **Every production change has a version tag** and appears in the Releases
  list — easy to answer "what's running right now?" and "when did this
  regression start?".
- **Release notes are forced** — `gh release create --generate-notes` gives
  you a concrete changelog per deploy.
- **Rollback has a clear target** — re-running a previous release's
  workflow runs puts the matching code back on prod.
- **Main can drift from prod** without risk — WIP commits, in-progress
  refactors, and typo fixes all accumulate on `main` safely and ship
  together on the next release.

## Rollback

### Frontend

CloudFront caches HTML for 60 seconds and hashed assets for 1 year (immutable).
To roll back to a previous frontend version, re-run a previous successful
**Deploy frontend** workflow run from the Actions UI (three-dot menu → Re-run
all jobs). The previous commit will be rebuilt and synced. Invalidation
propagates globally in ~1 minute.

If you need to roll back further than the workflow run history, create a
revert commit, push it, and cut a release:

```bash
git revert <bad-commit-sha>
git push origin main
# Under release-gated deploys, the revert alone does nothing until you ship it:
gh release create v0.3.2 --generate-notes --target main
```

### Backend

The Lambda is deployed with `aws lambda update-function-code --publish`,
which creates a numbered version each time. The **Function URL is bound to
`$LATEST`**, not to a specific version or alias, so rollback works by
overwriting `$LATEST` with earlier code. Two ways:

1. **Re-run a previous successful `deploy-backend.yml` workflow run** from
   the Actions UI. The workflow re-checks out the commit from that run,
   rebuilds the Lambda bundle, and pushes it as the new `$LATEST`. This is
   the easiest option.
2. **Revert the offending commit and publish a new release**. Under
   release-gated deploys, the revert alone won't ship — you need a release
   to trigger the workflow:

   ```bash
   git revert <bad-commit-sha>
   git push origin main
   gh release create v0.3.2 --generate-notes --target main
   ```

   The deploy-backend workflow fires when the release is published.

Historical versions are preserved by the `--publish` flag (you can see them
with `aws lambda list-versions-by-function`), so you could also invoke a
specific version manually if you wanted — but the Function URL will keep
pointing at `$LATEST` until you either overwrite it or create an alias. For
now, the two workflow-based options above are the supported rollback path.

### Studio

The Sanity CLI doesn't provide first-class rollback for the studio app. If
a studio deploy breaks things, re-check out the previous commit for the
`studio/` folder and re-run the deploy:

```bash
git checkout <previous-commit> -- studio
pnpm studio deploy
git checkout HEAD -- studio
```

Or revert the commit on `main` — the `deploy-studio.yml` workflow will pick
it up automatically.

### Infrastructure (Terraform)

Terraform state is versioned in S3. If a bad `terraform apply` breaks
something, roll back by either:

- `git revert` the infra change and re-running `terraform apply`
- `terraform state rollback` to a previous state version (S3 versioning)
- Manually editing state with `terraform import` / `terraform state rm` —
  only as a last resort

## Adding a new content type

Suppose you want to add a new content type to the CMS — for example,
"FAQ entries" or "press mentions". The pattern is consistent across the
document types we already have (`product`, `galleryPhoto`, `testimonial`,
`order`); the example below uses a hypothetical `pressMention` to keep
the worked code distinct from anything already shipped.

### 1. Create the Sanity schema

Create `studio/schemas/pressMention.ts`:

```typescript
import { defineField, defineType } from 'sanity';

export const pressMention = defineType({
  name: 'pressMention',
  title: 'Press mention',
  type: 'document',
  fields: [
    defineField({ name: 'publication', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'headline', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'url', type: 'url' }),
    defineField({ name: 'visible', type: 'boolean', initialValue: true }),
    defineField({ name: 'order', type: 'number', initialValue: 0 })
  ],
  orderings: [{ title: 'Display order', name: 'orderAsc', by: [{ field: 'order', direction: 'asc' }] }]
});
```

(See `studio/schemas/testimonial.ts` in the repo for a fuller example
with field descriptions, validation limits, and a custom preview.)

### 2. Register it in the schema index

`studio/schemas/index.ts`:

```typescript
import { pressMention } from './pressMention';
// ... plus existing imports ...

export const schemaTypes = [product, galleryPhoto, testimonial, order, pressMention];
```

### 3. Add the backend type + query helper

In `backend/src/sanity.ts`, add the TypeScript type, the GROQ query, and a
fetcher:

```typescript
export type SanityPressMention = {
  _id: string;
  publication: string;
  headline: string;
  url: string | null;
  visible: boolean;
  order: number;
};

const PRESS_MENTIONS_QUERY = `*[_type == "pressMention" && visible == true] | order(order asc) {
  _id, publication, headline, url, visible, order
}`;

export async function getPressMentions(): Promise<SanityPressMention[]> {
  const client = getClient();
  return client.fetch<SanityPressMention[]>(PRESS_MENTIONS_QUERY);
}
```

### 4. Create the backend route

`backend/src/routes/press-mentions.ts`:

```typescript
import { Hono } from 'hono';
import { getPressMentions } from '../sanity.js';

export const pressMentions = new Hono();

pressMentions.get('/', async (c) => {
  try {
    const list = await getPressMentions();
    return c.json({ pressMentions: list });
  } catch (err) {
    console.error('Failed to fetch press mentions', err);
    return c.json({ pressMentions: [], error: 'Failed to load' }, 500);
  }
});
```

### 5. Mount it in `app.ts`

```typescript
import { pressMentions } from './routes/press-mentions.js';
// ...
app.route('/press-mentions', pressMentions);
```

### 6. Frontend consumption

Two options depending on the route's characteristics:

- **Static with a server loader** (`+page.server.ts` with `prerender = true`)
  — data is fetched at build time and baked into HTML. Good for content that
  changes rarely and benefits from SEO.
- **Client-side fetch** (`+page.ts` with `prerender = true, ssr = true`,
  `onMount` fetch) — data is fetched on mount with a skeleton loading state.
  Good for content that changes frequently or is behind the fold. This is
  what `/shop` and `/gallery` use.

### 7. Deploy

```bash
git add studio/ backend/ frontend/
git commit -m "feat: add press-mentions content type"
git push origin main
gh release create v0.4.0 --generate-notes --target main
```

Publishing the release fires all three deploy workflows in parallel, so the
backend, frontend, and studio ship together. If you don't want to cut a
release yet (e.g. you're still iterating), run `pnpm studio deploy` locally
to push the schema so Meryl can start using the new content type while the
frontend/backend code is still in progress.

If the new type should trigger content rebuilds, extend the content-rebuild
Sanity webhook's GROQ filter to include it:

```groq
_type == "product" || _type == "galleryPhoto" || _type == "testimonial" || _type == "pressMention"
```

## Cost expectations

Approximate monthly cost for a site with hundreds of visitors and a few
orders per week, in South African Rand:

| Service | Cost | Notes |
|---|---|---|
| S3 (frontend bucket + state bucket) | ~R1 | Storage + requests, mostly under free tier |
| CloudFront | R0–10 | First 1 TB of egress is free for 12 months, then ~R1.50/GB |
| Lambda (requests + compute) | R0 | Free tier covers 1M requests + 400k GB-seconds/month |
| Lambda Function URL | R0 | No extra cost beyond Lambda itself |
| Route 53 hosted zone | ~R10 | Flat ~R9 per zone per month |
| ACM certificate | R0 | Free for public certs |
| CloudWatch Logs | R0–5 | Depends on log volume; 30-day retention in the config |
| DynamoDB lock table | R0 | Pay-per-request, negligible at this usage |
| Sanity | R0 | Free "Growth" tier is plenty for this scale |
| Resend | R0 | Free tier: 3000 emails/month |

**Total: ~R15–30/month**, most of which is the Route 53 hosted zone. If you
host DNS elsewhere you can save ~R10 of this, but you lose the ability for
Terraform to manage DNS records automatically.

These numbers are approximate and will vary with traffic. A sudden spike
(thousands of visitors/day, e.g. going viral) could push CloudFront and
Resend costs up — budget alerts are a good idea, see the CloudWatch +
Billing console.

## Tearing everything down

```bash
cd infra
terraform destroy
```

This removes every AWS resource Terraform created — S3 bucket, CloudFront,
Lambda, IAM, Route 53 records, ACM cert, DynamoDB lock table, OIDC provider.

It does **not** remove:

- The Terraform state bucket or lock table (created by the setup script, not
  Terraform itself — delete manually if you want a clean slate)
- Your Sanity project (delete via Sanity dashboard)
- Your Resend account or verified domain
- Your domain registration or the Route 53 hosted zone

Destroying is permanent. Everything can be re-created by running the setup
script again, but any content in Sanity will still be there (because Sanity
is separate from AWS).

## Troubleshooting

**`terraform init` fails with "bucket does not exist"**
: You ran Terraform directly without running `bin/setup.sh` first. The state
  bucket is created by the script. Either run `./bin/setup.sh` or create the
  bucket manually (see [Appendix A](#appendix-a-understanding-what-binsetupsh-does)).

**Setup script: "af-south-1 is not enabled"**
: Opt-in regions require manual activation. AWS Console → account menu →
  Account → AWS Regions → Enable *Africa (Cape Town)*. Takes ~5 minutes
  before the region responds.

**Setup script: "SANITY_ADMIN_TOKEN env var is not set"**
: Not fatal — the AWS and GitHub parts will still run. You can re-run the
  script later with the token set to automate the Sanity dataset privacy and
  webhook creation. Or do those two steps manually in the Sanity dashboard.

**Setup script: Sanity webhook creation returns 401**
: Your `SANITY_ADMIN_TOKEN` doesn't have Administrator scope. Create a new
  token with Administrator permissions and re-run.

**Frontend deployed but shows "Could not load products"**
: Check the browser devtools Network tab for the failing request. Common
  causes: backend not yet deployed, `PUBLIC_API_URL` GitHub variable wrong,
  Lambda cold-starting (first request after a long idle period can take 2–3
  seconds — retry).

**Order submission succeeds but no emails arrive**
: Check Resend dashboard → Emails → Log for the attempted send. If it's not
  there, the Lambda isn't reaching Resend — check CloudWatch Logs for the
  Lambda. If it's there but marked `failed`, your sending domain isn't fully
  verified.

**Sanity webhook fires but returns 401**
: The backend's `SANITY_WEBHOOK_SECRET` doesn't match the secret configured
  in the Sanity webhook. Make sure you pasted the same value into
  `terraform.tfvars` and the webhook's "Secret" field in Sanity.

**Content-rebuild webhook fires but GitHub workflow doesn't run**
: Common causes: the GitHub PAT in the webhook has expired, the PAT doesn't
  have `Contents: write` on the repo, or the URL has the wrong owner/repo.
  Check the Sanity webhook's **Attempts** tab — it shows the response GitHub
  returned, which will tell you what's wrong.

**Order-status email sent on every publish (even non-status edits)**
: The Sanity webhook's GROQ filter is wrong. It should be
  `_type == "order" && delta::changedAny(status)` — the `delta::changedAny`
  is what restricts firing to actual status changes. `delta::changedAny` is
  a Sanity-specific GROQ function; it's not a typo.

**Lambda cold start is slow on first request after idle**
: Expected. Node 20 Lambda cold starts are ~300–800 ms for our 787 KB
  bundle at 512 MB (the `memory_size` set in `infra/lambda.tf`). Subsequent
  requests are ~5–20 ms. The memory bump was a deliberate trade: AWS scales
  CPU linearly with memory up to ~1792 MB at the same per-ms price, so 512 MB
  roughly halves cold-start time vs. the 128 MB default without meaningfully
  increasing cost. If it still becomes a UX problem, look at Provisioned
  Concurrency (costs extra) or a scheduled CloudWatch rule that pings
  `/health` every 5 minutes to keep the function warm.

## Appendix A: Understanding what `bin/setup.sh` does

For anyone who wants to understand the automated steps, or run them by hand
in an emergency. Each section below is what the script does for the
corresponding step.

### A1. Prerequisite checks

```bash
command -v aws terraform gh jq curl
aws sts get-caller-identity    # must succeed
gh auth status                 # must succeed
test -f infra/terraform.tfvars # must exist
```

### A2. State backend bootstrap

```bash
export AWS_REGION=af-south-1
STATE_BUCKET=meryl-green-designs-tfstate
LOCK_TABLE=meryl-green-designs-tfstate-lock

# S3 bucket
aws s3api create-bucket \
  --bucket "$STATE_BUCKET" --region "$AWS_REGION" \
  --create-bucket-configuration LocationConstraint="$AWS_REGION"

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
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# DynamoDB lock table
aws dynamodb create-table \
  --table-name "$LOCK_TABLE" \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "$AWS_REGION"
```

### A3. Terraform apply

```bash
cd infra
terraform init -upgrade
terraform plan -out=.setup.tfplan
terraform apply .setup.tfplan
```

### A4. Populate GitHub Actions variables

```bash
# Read outputs
cd infra
OUTPUTS=$(terraform output -json)
FRONTEND_BUCKET=$(echo "$OUTPUTS" | jq -r '.frontend_bucket_name.value')
CLOUDFRONT_ID=$(echo "$OUTPUTS" | jq -r '.cloudfront_distribution_id.value')
LAMBDA_NAME=$(echo "$OUTPUTS" | jq -r '.lambda_function_name.value')
LAMBDA_URL=$(echo "$OUTPUTS" | jq -r '.lambda_function_url.value')
ROLE_ARN=$(echo "$OUTPUTS" | jq -r '.github_actions_role_arn.value')
cd -

# Create environment (idempotent)
gh api --silent -X PUT "repos/$GITHUB_REPO/environments/production"

# Set variables
for pair in \
  "AWS_REGION=af-south-1" \
  "AWS_ROLE_TO_ASSUME=$ROLE_ARN" \
  "FRONTEND_BUCKET=$FRONTEND_BUCKET" \
  "CLOUDFRONT_DISTRIBUTION_ID=$CLOUDFRONT_ID" \
  "LAMBDA_FUNCTION_NAME=$LAMBDA_NAME" \
  "PUBLIC_API_URL=$LAMBDA_URL" \
  "PUBLIC_SANITY_PROJECT_ID=$SANITY_PROJECT_ID" \
  "PUBLIC_SANITY_DATASET=production"
do
  name="${pair%%=*}"
  value="${pair#*=}"
  gh variable set "$name" --env production --body "$value" --repo "$GITHUB_REPO"
done
```

### A5. Flip Sanity dataset to private

```bash
curl -X PATCH \
  "https://api.sanity.io/v2021-06-07/projects/$SANITY_PROJECT_ID/datasets/production" \
  -H "Authorization: Bearer $SANITY_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"aclMode": "private"}'
```

### A6. Create backend Sanity webhook

```bash
curl -X POST \
  "https://api.sanity.io/v2021-06-07/projects/$SANITY_PROJECT_ID/hooks" \
  -H "Authorization: Bearer $SANITY_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "name": "Order status email",
  "url": "${LAMBDA_URL}webhooks/sanity-order",
  "dataset": "production",
  "type": "document",
  "rule": {
    "on": ["update"],
    "filter": "_type == \"order\" && delta::changedAny(status)",
    "projection": ""
  },
  "httpMethod": "POST",
  "apiVersion": "v2024-10-01",
  "secret": "$SANITY_WEBHOOK_SECRET",
  "isDisabled": false
}
EOF
```

This is roughly the full script in bash. The real
[`bin/setup.sh`](../bin/setup.sh) adds prerequisite checks, error handling,
idempotency guards, and the final checklist output — around 500 lines total
— but the core logic is what's above.
