#!/bin/bash
set -e

# Reset local R2 bucket by deleting local state

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WRANGLER_STATE="${SCRIPT_DIR}/../.wrangler/state"

echo "🗑️  Resetting local R2 bucket..."
echo ""

if [ -d "$WRANGLER_STATE" ]; then
    echo "Deleting .wrangler/state directory..."
    rm -rf "$WRANGLER_STATE"
    echo "✅ Local R2 state deleted"
else
    echo "✅ No local R2 state found (already clean)"
fi

echo ""
echo "💡 To reseed the bucket: npm run seed:dev"
