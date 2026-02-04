#!/bin/bash
set -e

# Seed local R2 bucket with minimal test data for development

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_DIR="${SCRIPT_DIR}/../tests/fixtures"

# Generate test data if not exists
if [ ! -f "${TEST_DIR}/root-ca.crt" ]; then
    echo "📦 Generating test data first..."
    bash "${SCRIPT_DIR}/generate-test-data.sh"
fi

echo "🌱 Seeding local R2 bucket with minimal test data..."
echo ""
echo "📦 Uploading core CA certificates only..."
echo "   (Workers can handle CRL uploads via API)"
echo ""

# Upload only core certificates (DER format)
if [ -f "${TEST_DIR}/root-ca.der" ]; then
    echo "  → ca/root-ca.crt"
    npx wrangler r2 object put aia-cdp-local/ca/root-ca.crt --file="${TEST_DIR}/root-ca.der" --local --persist-to=.wrangler/state
fi

if [ -f "${TEST_DIR}/intermediate-ca.der" ]; then
    echo "  → ca/intermediate-ca.crt"
    npx wrangler r2 object put aia-cdp-local/ca/intermediate-ca.crt --file="${TEST_DIR}/intermediate-ca.der" --local --persist-to=.wrangler/state
fi

echo ""
echo "✅ Local R2 bucket seeded successfully!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 To manually upload additional files to R2:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Upload a certificate (DER format):"
echo "  $ npx wrangler r2 object put aia-cdp-local/ca/mycert.crt --file=path/to/cert.der --local --persist-to=.wrangler/state"
echo ""
echo "  Upload a CRL (PEM format):"
echo "  $ npx wrangler r2 object put aia-cdp-local/crl/mycrl.crl --file=path/to/crl.pem --local --persist-to=.wrangler/state"
echo ""
echo "  Upload a Delta CRL (DER format):"
echo "  $ npx wrangler r2 object put aia-cdp-local/dcrl/mycrl.crl --file=path/to/dcrl.der --local --persist-to=.wrangler/state"
echo ""
echo "  Or use the API endpoint:"
echo "  $ curl -X POST http://localhost:8787/api/v1/crls \\"
echo "       -H 'Content-Type: text/plain' \\"
echo "       --data-binary @path/to/crl.pem"
echo ""
echo "  Reset R2 bucket:"
echo "  $ npm run reset:dev"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 Start the dev server with: npm run dev"

