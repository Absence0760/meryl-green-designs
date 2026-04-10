# Deployment

This document walks through the first-time deployment of the three apps to
production, and the ongoing deploy pipeline that keeps them updated.

For the conceptual picture of how the pieces fit together, see
[architecture.md](./architecture.md).

## What gets deployed where

| App | Target | How |
|---|---|---|
| Frontend | S3 + CloudFront (AWS) | `deploy-frontend.yml` workflow |
| Backend | Lambda + Function URL (AWS) | `deploy-backend.yml` workflow |
| Studio | Sanity hosted (`*.sanity.studio`) | `deploy-studio.yml` workflow |

Infrastructure (the S3 bucket, Lambda, IAM role, DNS records, etc.) is managed
by Terraform in `infra/`. Application code is deployed by GitHub Actions
workflows in `.github/workflows/`. The two are separate: Terraform sets up
the resources, the workflows update them.

## First-time deployment

### 1. Pre-requisites

- An AWS account with the **Africa (Cape Town) `af-south-1` region enabled**
  (Account Settings → AWS Regions → enable)
- A registered domain (e.g. `merylgreendesigns.co.za`)
- A **Route 53 hosted zone** for that domain. If the domain is currently with
  a different DNS provider, create the hosted zone in Route 53 first and
  update the domain's nameservers to point at it.
- A **Sanity account + project** — create one at https://www.sanity.io/manage
- A **Resend account** with a verified sending domain — sign up at
  https://resend.com
- Terraform `>= 1.6.0` and AWS CLI v2 installed locally

### 2. Bootstrap the Terraform state backend

Terraform stores its state in S3 with a DynamoDB lock. Both must exist before
`terraform init` works. Create them manually, once:

```bash
export AWS_REGION=af-south-1

aws s3api create-bucket \
  --bucket meryl-green-designs-tfstate \
  --region "$AWS_REGION" \
  --create-bucket-configuration LocationConstraint="$AWS_REGION"

aws s3api put-bucket-versioning \
  --bucket meryl-green-designs-tfstate \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
  --bucket meryl-green-designs-tfstate \
  --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

aws s3api put-public-access-block \
  --bucket meryl-green-designs-tfstate \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws dynamodb create-table \
  --table-name meryl-green-designs-tfstate-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "$AWS_REGION"
```

Then uncomment the `backend "s3"` block at the top of `infra/main.tf`.

### 3. Configure Terraform variables

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars
```

Fill in:

- `domain_name` — the apex domain
- `route53_zone_id` — look it up with
  `aws route53 list-hosted-zones-by-name --dns-name <domain>`
- `github_repo` — `owner/name` form (e.g. `jaredhoward/meryl-green-designs`)
- `resend_api_key` — from the Resend dashboard
- `from_email` — a verified sender in Resend
- `owner_email` — where order notifications go
- `sanity_project_id` — from https://www.sanity.io/manage

### 4. Apply the infrastructure

```bash
cd infra
terraform init
terraform plan    # review — should show ~20 resources being created
terraform apply
```

The first apply takes ~15 minutes — most of the wait is CloudFront
propagating globally. When it finishes, note the outputs:

```
frontend_bucket_name         = meryl-green-designs-frontend
cloudfront_distribution_id   = E1ABCDEFGHIJKL
lambda_function_name         = meryl-green-designs-backend
lambda_function_url          = https://xxxxx.lambda-url.af-south-1.on.aws/
github_actions_role_arn      = arn:aws:iam::123456789012:role/meryl-green-designs-github-actions
site_url                     = https://merylgreendesigns.co.za
```

### 5. Configure GitHub Actions

In the GitHub repo, go to **Settings → Secrets and variables → Actions** and
create a new environment named `production`. In that environment, add these
**variables** (not secrets — none of these are sensitive):

| Variable name | Value (from Terraform outputs) |
|---|---|
| `AWS_REGION` | `af-south-1` |
| `AWS_ROLE_TO_ASSUME` | `github_actions_role_arn` |
| `FRONTEND_BUCKET` | `frontend_bucket_name` |
| `CLOUDFRONT_DISTRIBUTION_ID` | `cloudfront_distribution_id` |
| `LAMBDA_FUNCTION_NAME` | `lambda_function_name` |
| `PUBLIC_API_URL` | `lambda_function_url` (copy as-is) |
| `PUBLIC_SANITY_PROJECT_ID` | Your Sanity project ID |
| `PUBLIC_SANITY_DATASET` | `production` |

And add one **secret** (studio deploys only):

| Secret name | How to get it |
|---|---|
| `SANITY_AUTH_TOKEN` | Run `pnpm studio exec sanity manage` locally, go to **API → Tokens**, create a token with `Deploy Studio` permissions, copy the value |

### 6. First frontend deploy

```bash
# Option A — trigger via the GitHub Actions UI
# Go to Actions → Deploy frontend → Run workflow → main

# Option B — push an empty commit to trigger it
git commit --allow-empty -m "chore: trigger first deploy"
git push origin main
```

Wait for the workflow to complete (~2 min). Check the site:

```bash
curl -I https://merylgreendesigns.co.za
# Expect HTTP/2 200, content-type: text/html
```

### 7. First backend deploy

Trigger the **Deploy backend** workflow the same way (Actions → Run workflow,
or push a change to `backend/`). After it runs, verify the Lambda is healthy:

```bash
curl https://xxxxx.lambda-url.af-south-1.on.aws/health
# Expect {"ok":true}
```

Then submit a test order on the live site. You should receive both the owner
and customer emails from Resend.

### 8. First studio deploy

```bash
# Locally — this is a one-time interactive step the first time.
cd studio
cp .env.example .env
# Fill in SANITY_STUDIO_PROJECT_ID from your Sanity project
pnpm exec sanity login    # opens a browser for Sanity SSO
pnpm exec sanity deploy
# Pick a subdomain when prompted, e.g. "merylgreendesigns"
```

This publishes the studio to `https://merylgreendesigns.sanity.studio`.
Share that URL with Meryl — she logs in with a Sanity account you've invited
her to from https://www.sanity.io/manage.

After the first interactive deploy, the **Deploy studio** workflow handles
subsequent deploys automatically on pushes to `studio/`.

### 9. Wire the Sanity webhook

This is the piece that lets Meryl's content edits rebuild the site
automatically. One-time setup, done in the Sanity dashboard.

1. Create a **fine-grained GitHub PAT** at
   https://github.com/settings/tokens?type=beta:
   - Repository access: only select `jaredhoward/meryl-green-designs`
   - Repository permissions: **Contents: Read and write**
   - Expiration: 1 year
   - Copy the token.

2. Go to https://www.sanity.io/manage, pick your project, then **API →
   Webhooks → Create webhook**:
   - **Name**: `Rebuild site on publish`
   - **Description**: Triggers frontend redeploy via GitHub Actions
   - **URL**: `https://api.github.com/repos/jaredhoward/meryl-green-designs/dispatches`
   - **Dataset**: `production`
   - **Trigger on**: Create, Update, Delete
   - **Filter**: `_type == "product"` (leave empty to rebuild on any change)
   - **HTTP method**: `POST`
   - **HTTP headers**:
     - `Authorization: Bearer <your GitHub PAT from step 1>`
     - `Accept: application/vnd.github+json`
     - `X-GitHub-Api-Version: 2022-11-28`
   - **HTTP body**:
     ```json
     {"event_type": "sanity-publish"}
     ```
   - **Enabled**: yes

3. Save the webhook. Test it by editing a product in the studio and clicking
   Publish — a **Deploy frontend** workflow run should start in GitHub within
   a few seconds.

Total time from Meryl clicking Publish to the change being live on the site:
~60 seconds.

## Ongoing deployments

After first-time setup, deploys are automatic:

- **Code changes**: push to `main`. Path filters on the workflows mean only
  the affected package redeploys (change `backend/` → only the backend
  workflow runs).
- **Content changes**: Meryl publishes in the studio → Sanity webhook →
  frontend workflow runs → S3 sync → CloudFront invalidation → live.
- **Rotating Lambda env vars** (e.g., new Resend key): update
  `infra/terraform.tfvars` and run `terraform apply`. No code redeploy
  needed.

## Rollback

### Frontend

CloudFront caches are short-lived on HTML (60 seconds) and long-lived on
hashed assets (1 year, immutable). To roll back the frontend, re-run a
previous successful **Deploy frontend** workflow run from the Actions UI —
the old commit will be rebuilt and synced.

### Backend

Lambda versions are published automatically by the deploy workflow (`--publish`
flag). To roll back:

```bash
aws lambda update-alias \
  --function-name meryl-green-designs-backend \
  --name live \
  --function-version <previous-version>
```

Or simply re-run a previous successful **Deploy backend** workflow run.

### Studio

The Sanity CLI does not provide first-class rollback for the studio itself.
If a studio deploy breaks things, redeploy an earlier commit:

```bash
git checkout <previous-commit> -- studio
pnpm studio exec sanity deploy
git checkout HEAD -- studio
```

## Cost expectations

Approximate monthly costs for a site with hundreds of visitors and a few
orders per week:

- **S3**: ~R1 (storage) + ~R0 (requests, under free tier)
- **CloudFront**: ~R0–10 (under 1TB/month free tier for the first year, then
  ~R1.50/GB out)
- **Lambda**: R0 (free tier covers millions of requests/month)
- **Route 53**: ~R10 (R9 per hosted zone per month)
- **ACM certificate**: free
- **CloudWatch Logs**: ~R0–5 depending on log volume
- **DynamoDB lock table**: R0 (pay-per-request, negligible)
- **Sanity**: free (free tier covers this scale indefinitely)
- **Resend**: free (3000 emails/month free tier)

**Total: ~R15–30/month**, most of which is the Route 53 hosted zone fee.

## Tearing everything down

```bash
cd infra
terraform destroy
```

This removes all AWS resources Terraform created. It does **not** touch the
state bucket, the lock table, the Sanity project, Resend, or the domain
registration — those were set up manually and you'll delete them separately
if you want to.
