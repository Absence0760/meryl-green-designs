# Infrastructure

Terraform configuration for the Meryl Green Designs AWS resources.

## What it creates

- **S3 bucket** hosting the prerendered SvelteKit site, with versioning
  enabled and a lifecycle rule that expires noncurrent versions after 30 days
- **CloudFront distribution** with Origin Access Control in front of the bucket
- **CloudFront response headers policy** applying HSTS (1y, includeSubDomains,
  preload), X-Frame-Options DENY, X-Content-Type-Options nosniff, and
  Referrer-Policy strict-origin-when-cross-origin to every response
- **ACM certificate** (in us-east-1, as CloudFront requires) with DNS validation
- **Route 53 records** for the apex domain, `www`, and cert validation
- **Lambda function** running the Hono backend as an ESM bundle
- **API Gateway v2 (HTTP API)** fronting the Lambda via an AWS_PROXY
  integration. CloudFront's `/api/*` behavior forwards to API Gateway, so
  the backend is reachable at `merylgreendesigns.com/api/*`. A CloudFront
  Function strips the `/api` prefix before forwarding, keeping Hono routes
  at their natural paths (`/orders`, `/products`, etc.). Stage-level
  throttling (50 rps / 100 burst) caps global request rate as a
  defence-in-depth complement to the per-IP limiter in
  `backend/src/rate-limit.ts`.
- **Lambda execution IAM role** + CloudWatch log group (30-day retention)
- **GitHub OIDC provider** + IAM role for CI, trust-policied to the
  `production` GitHub Actions environment (environment-scoped rather than
  branch-scoped so release-triggered deploys on `refs/tags/*` work)
- **AWS Budget** with email alerts at 50% / 80% / 100% **actual** plus a
  100% **forecasted** notification, all of a configurable monthly cap
  (default $30 — see `monthly_budget_usd` in `variables.tf`)
- **DynamoDB table** (`meryl-green-designs-orders`) for customer order PII,
  joined to the Sanity order document by `orderRef`. Point-in-time recovery
  on, TTL on (drives POPIA retention — each row is deleted 365 days after
  creation), SSE with the AWS-managed `aws/dynamodb` key, `prevent_destroy`
  on. See `dynamodb.tf` and `docs/orders-pii-split-plan.md`.
- **Daily auto-cancel Lambda + EventBridge schedule rule**
  (`meryl-green-designs-auto-cancel`, 06:00 UTC daily) that flips
  `pending_payment` Sanity orders older than 30 days to `cancelled`.
  Honors the abandoned-checkout commitment in `/privacy`. Code in
  `backend/src/auto-cancel-lambda.ts`; infra in `auto_cancel.tf`. Has
  `prevent_destroy` on, its own IAM role (Sanity write only), CloudWatch
  alarms (Errors + no-recent-invocation) routed via an SNS topic
  (`meryl-green-designs-ops-alerts`) to `ops_alerts_email`, and an SQS
  dead-letter queue for EventBridge drops.
- **Reserved concurrency** on the backend Lambda
  (`lambda_reserved_concurrency`, default 20) caps blast radius from a
  runaway loop or hostile burst — see `variables.tf`.
- **Admin API token + Studio CORS origins** (`admin_api_token`,
  `studio_origins`) feed the Lambda env for the `/admin/*` PII routes
  consumed by the Studio's custom field components.

For a full architectural picture see [`../docs/architecture.md`](../docs/architecture.md).
For first-time deploy walkthrough see [`../docs/deployment.md`](../docs/deployment.md).

## Prerequisites

- Terraform `>= 1.13.0` (earlier versions ship an embedded HashiCorp
  PGP key that expired in 2026; provider downloads fail with
  `openpgp: key expired`)
- AWS CLI v2 configured with credentials for a user that can create IAM, S3,
  CloudFront, Lambda, and Route 53 resources
- The apex domain's Route 53 hosted zone must already exist (Terraform will
  not create it, only add records to it)
- The `af-south-1` region must be **enabled** in your AWS account (Account
  → AWS Regions → enable Africa (Cape Town))

## Easiest path: use `bin/setup.sh`

The project ships with a one-command bootstrap script at
[`../bin/setup.sh`](../bin/setup.sh) that handles every step below
automatically (plus populates GitHub Actions env vars and Sanity webhooks).

```bash
./bin/setup.sh
```

If you'd rather run things by hand — or you want to understand what the
script does — read on.

## One-time bootstrap (before `terraform init`)

> The setup script does this for you. This section is the manual version.

Terraform stores its state in an S3 bucket with a DynamoDB lock table. You
must create these manually the first time, because Terraform can't create its
own state backend.

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
  --server-side-encryption-configuration '{
    "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
  }'

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

The `backend "s3"` block in `main.tf` is already configured with these
bucket/table names, so the next `terraform init` will pick them up.

## Configure

Variables live in `terraform.tfvars.sops` — SOPS-encrypted with the
project KMS key (`alias/meryl-green-designs-sops`). The plaintext
`terraform.tfvars` file is gitignored and only exists transiently when
`bin/setup.sh` decrypts it for `terraform apply`.

To seed the encrypted file from the example (first-time only):

```bash
../bin/sops-init.sh   # creates the KMS key, .sops.yaml, and seeds *.sops files
```

To edit:

```bash
sops terraform.tfvars.sops   # opens in $EDITOR, re-encrypts on save
```

Running `bin/setup.sh` decrypts to a scratch `terraform.tfvars`, runs
the apply, and shreds the plaintext on exit. Don't manually decrypt for
day-to-day use — `terraform plan` / `apply` from the repo's CI path
goes through the same script.

## Apply

```bash
terraform init
terraform plan            # review the changes
terraform apply
```

The first apply takes ~15 minutes (most of it waiting for CloudFront to
propagate). After it finishes, Terraform prints the outputs — copy
`github_actions_role_arn`, `api_url`, and `cloudfront_distribution_id`
into your GitHub Actions workflow secrets/variables (see `docs/deployment.md`).

## Rotating secrets

To rotate `resend_api_key` (or `admin_api_token`, PayFast credentials,
Sanity write token, etc.):

```bash
sops terraform.tfvars.sops   # edit the value
# then re-run setup.sh or apply manually with the decrypted scratch file
```

`terraform apply` updates the Lambda's environment variables in place —
no code redeploy needed.

## Tearing down

```bash
terraform destroy
```

This removes everything Terraform created — **but the orders DynamoDB
table (`dynamodb.tf`) and the auto-cancel Lambda (`auto_cancel.tf`)
both set `prevent_destroy = true`**, so a plain `destroy` will refuse
to delete them. To actually tear down, you must flip those flags off
first, run `terraform apply` to register the change, then
`terraform destroy`. This guard is deliberate — the orders table holds
customer PII subject to a 365-day retention commitment.

`destroy` does **not** remove the state bucket or DynamoDB lock table —
those were created manually in the bootstrap step and you must delete
them by hand if you want a clean slate.

## Why not CDK?

The rest of the stack is TypeScript, so CDK would have been a natural fit.
Terraform was chosen because:

- It's declarative HCL, which is easier to read and review than generated
  CloudFormation
- State is explicit and portable — you can see exactly what Terraform thinks
  exists, and moving it between machines is a single `s3 cp` command
- The provider ecosystem covers Sanity, GitHub, and Cloudflare if the project
  ever needs them, without switching tools
