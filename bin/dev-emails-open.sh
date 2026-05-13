#!/usr/bin/env bash
# Open the most recent locally-captured email (EMAIL_BACKEND=file) in
# the default browser. No-op with a helpful message if there's nothing
# to open. Used by `pnpm dev:emails`.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$REPO_ROOT/backend/.dev-emails"

if [ ! -d "$DIR" ]; then
	echo "No captured emails yet. Set EMAIL_BACKEND=file in backend/.env and trigger an email-sending flow." >&2
	exit 0
fi

LATEST=$(ls -t "$DIR"/*.html 2>/dev/null | head -1 || true)

if [ -z "$LATEST" ]; then
	echo "No .html files in $DIR yet." >&2
	exit 0
fi

# xdg-open on Linux, open on macOS. Fall through to printing the path
# if neither is available so the user can copy it.
if command -v xdg-open >/dev/null 2>&1; then
	xdg-open "$LATEST"
elif command -v open >/dev/null 2>&1; then
	open "$LATEST"
else
	echo "Latest email: file://$LATEST"
fi
