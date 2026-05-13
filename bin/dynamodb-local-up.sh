#!/usr/bin/env bash
# Idempotent local-dev bootstrap for DynamoDB. Starts the docker-compose
# service if it isn't already running and creates the `meryl-green-designs-
# orders` table (matching the prod schema in infra/dynamodb.tf) if it's
# missing. Safe to re-run.
#
# Local dev runs against this — production hits the real AWS-hosted table.
# See backend/src/dynamo.ts: DYNAMODB_ENDPOINT in the env routes the SDK
# here; unset → real AWS.
#
# Requires: docker compose, AWS CLI v2. The AWS CLI calls below use
# dummy creds because the local container doesn't verify them.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ENDPOINT="http://localhost:8000"
TABLE_NAME="meryl-green-designs-orders"
REGION="af-south-1"

export AWS_ACCESS_KEY_ID=local
export AWS_SECRET_ACCESS_KEY=local
export AWS_REGION="$REGION"

log() { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }
ok()  { printf '\033[1;32m✓\033[0m %s\n' "$*"; }

# --- container ---
if docker compose ps --services --filter "status=running" 2>/dev/null | grep -qx dynamodb-local; then
	ok "dynamodb-local already running"
else
	log "Starting dynamodb-local container"
	docker compose up -d dynamodb-local
fi

# Wait for the port to accept connections. The DynamoDB Local image
# answers HTTP 400 to a bare GET, which is enough to confirm it's up.
log "Waiting for $ENDPOINT to accept connections"
for i in $(seq 1 30); do
	if curl -s -o /dev/null -w '%{http_code}' "$ENDPOINT" 2>/dev/null | grep -qE '^[2-4][0-9]{2}$'; then
		ok "DynamoDB Local ready"
		break
	fi
	if [ "$i" -eq 30 ]; then
		echo "ERROR: DynamoDB Local did not respond within 30 seconds" >&2
		exit 1
	fi
	sleep 1
done

# --- table ---
if aws dynamodb describe-table --endpoint-url "$ENDPOINT" --table-name "$TABLE_NAME" >/dev/null 2>&1; then
	ok "Table $TABLE_NAME already exists"
else
	log "Creating table $TABLE_NAME"
	aws dynamodb create-table \
		--endpoint-url "$ENDPOINT" \
		--table-name "$TABLE_NAME" \
		--attribute-definitions AttributeName=orderRef,AttributeType=S \
		--key-schema AttributeName=orderRef,KeyType=HASH \
		--billing-mode PAY_PER_REQUEST \
		>/dev/null
	ok "Table created"
fi

# TTL settings can't be set via create-table — they need a separate call.
TTL_STATUS=$(aws dynamodb describe-time-to-live --endpoint-url "$ENDPOINT" --table-name "$TABLE_NAME" --query 'TimeToLiveDescription.TimeToLiveStatus' --output text 2>/dev/null || echo "DISABLED")
if [ "$TTL_STATUS" = "ENABLED" ] || [ "$TTL_STATUS" = "ENABLING" ]; then
	ok "TTL already enabled on \`ttl\` attribute"
else
	log "Enabling TTL on \`ttl\` attribute"
	aws dynamodb update-time-to-live \
		--endpoint-url "$ENDPOINT" \
		--table-name "$TABLE_NAME" \
		--time-to-live-specification "Enabled=true, AttributeName=ttl" \
		>/dev/null
	ok "TTL enabled"
fi

echo
ok "Local DynamoDB is ready at $ENDPOINT"
echo "  Table: $TABLE_NAME (orderRef hash key, TTL on \`ttl\`)"
echo "  Stop:  docker compose down       (data persists)"
echo "  Wipe:  docker compose down -v    (resets local rows)"
