#!/bin/bash
set -e

# Generate test PKI data for local development
# Creates a CA, intermediate CA, leaf certificates, and various CRL test cases

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_DIR="${SCRIPT_DIR}/../tests/fixtures"
mkdir -p "${TEST_DIR}"

cd "${TEST_DIR}"

echo "🔐 Generating test PKI data with edge cases..."

# Root CA
if [ ! -f "root-ca.key" ]; then
    echo "Creating Root CA..."
    openssl genrsa -out root-ca.key 2048
    openssl req -new -x509 -days 3650 -key root-ca.key -out root-ca.crt \
        -subj "/C=US/ST=Test/L=TestCity/O=TestOrg/OU=TestRoot/CN=Test Root CA"
    openssl x509 -in root-ca.crt -outform DER -out root-ca.der
fi

# Intermediate CA
if [ ! -f "intermediate-ca.key" ]; then
    echo "Creating Intermediate CA..."
    openssl genrsa -out intermediate-ca.key 2048
    openssl req -new -key intermediate-ca.key -out intermediate-ca.csr \
        -subj "/C=US/ST=Test/L=TestCity/O=TestOrg/OU=TestIntermediate/CN=Test Intermediate CA"
    
    # Sign intermediate with root
    openssl x509 -req -in intermediate-ca.csr -CA root-ca.crt -CAkey root-ca.key \
        -CAcreateserial -out intermediate-ca.crt -days 1825 \
        -extfile <(printf "basicConstraints=CA:TRUE\nkeyUsage=keyCertSign,cRLSign")
    openssl x509 -in intermediate-ca.crt -outform DER -out intermediate-ca.der
fi

# Leaf certificates
if [ ! -f "leaf.key" ]; then
    echo "Creating leaf certificates..."
    # Valid leaf
    openssl genrsa -out leaf.key 2048
    openssl req -new -key leaf.key -out leaf.csr \
        -subj "/C=US/ST=Test/L=TestCity/O=TestOrg/OU=TestUnit/CN=test.example.com"
    openssl x509 -req -in leaf.csr -CA intermediate-ca.crt -CAkey intermediate-ca.key \
        -CAcreateserial -out leaf.crt -days 365 \
        -extfile <(printf "basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth,clientAuth")
    openssl x509 -in leaf.crt -outform DER -out leaf.der
    
    # Expired leaf
    openssl genrsa -out leaf-expired.key 2048
    openssl req -new -key leaf-expired.key -out leaf-expired.csr \
        -subj "/C=US/ST=Test/L=TestCity/O=TestOrg/OU=TestUnit/CN=expired.example.com"
    openssl x509 -req -in leaf-expired.csr -CA intermediate-ca.crt -CAkey intermediate-ca.key \
        -CAcreateserial -out leaf-expired.crt -days -1 \
        -extfile <(printf "basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment") 2>/dev/null || true
    [ -f "leaf-expired.crt" ] && openssl x509 -in leaf-expired.crt -outform DER -out leaf-expired.der
    
    # Revoked leaf (for CRL testing)
    openssl genrsa -out leaf-revoked.key 2048
    openssl req -new -key leaf-revoked.key -out leaf-revoked.csr \
        -subj "/C=US/ST=Test/L=TestCity/O=TestOrg/OU=TestUnit/CN=revoked.example.com"
    openssl x509 -req -in leaf-revoked.csr -CA intermediate-ca.crt -CAkey intermediate-ca.key \
        -CAcreateserial -out leaf-revoked.crt -days 365 \
        -extfile <(printf "basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment")
    openssl x509 -in leaf-revoked.crt -outform DER -out leaf-revoked.der
fi

# Rogue CA (not in trust chain)
if [ ! -f "rogue-ca.key" ]; then
    echo "Creating rogue CA for testing..."
    openssl genrsa -out rogue-ca.key 2048
    openssl req -new -x509 -days 3650 -key rogue-ca.key -out rogue-ca.crt \
        -subj "/C=XX/ST=Rogue/L=RogueCity/O=RogueOrg/OU=RogueUnit/CN=Rogue CA"
    openssl x509 -in rogue-ca.crt -outform DER -out rogue-ca.der
fi

# Setup CA database for proper CRL generation
echo "Setting up CA database..."
mkdir -p ca-db
touch ca-db/index.txt
echo "01" > ca-db/serial
echo "01" > ca-db/crlnumber

# Add revoked certificate to database
if [ -f "leaf-revoked.crt" ]; then
    SERIAL=$(openssl x509 -in leaf-revoked.crt -noout -serial | cut -d= -f2)
    echo "R	$(date -u +%y%m%d%H%M%SZ -d '+365 days')	$(date -u +%y%m%d%H%M%SZ)	${SERIAL}	unknown	/C=US/ST=Test/L=TestCity/O=TestOrg/OU=TestUnit/CN=revoked.example.com" >> ca-db/index.txt
fi

# Generate CRLs with different properties
echo "Generating various CRLs..."

# 1. Valid root CA CRL (empty)
openssl ca -gencrl -keyfile root-ca.key -cert root-ca.crt \
    -out root-ca.crl -config <(cat <<EOF
[ca]
default_ca = CA_default
[CA_default]
database = ca-db/index.txt
crlnumber = ca-db/crlnumber
default_md = sha256
default_crl_days = 30
EOF
) 2>/dev/null || true

# 2. Valid intermediate CA CRL with revoked certificate
openssl ca -gencrl -keyfile intermediate-ca.key -cert intermediate-ca.crt \
    -out intermediate-ca.crl -config <(cat <<EOF
[ca]
default_ca = CA_default
[CA_default]
database = ca-db/index.txt
crlnumber = ca-db/crlnumber
default_md = sha256
default_crl_days = 30
EOF
) 2>/dev/null || true

# 3. CRL with different CRL number (v2)
echo "02" > ca-db/crlnumber
openssl ca -gencrl -keyfile intermediate-ca.key -cert intermediate-ca.crt \
    -out intermediate-ca-v2.crl -config <(cat <<EOF
[ca]
default_ca = CA_default
[CA_default]
database = ca-db/index.txt
crlnumber = ca-db/crlnumber
default_md = sha256
default_crl_days = 30
EOF
) 2>/dev/null || true

# 4. CRL from rogue CA (not in trust chain)
openssl ca -gencrl -keyfile rogue-ca.key -cert rogue-ca.crt \
    -out rogue-ca.crl -config <(cat <<EOF
[ca]
default_ca = CA_default
[CA_default]
database = ca-db/index.txt
crlnumber = ca-db/crlnumber
default_md = sha256
default_crl_days = 30
EOF
) 2>/dev/null || true

# 5. CRL with broken signature (valid CRL but signature corrupted)
if [ -f "intermediate-ca.crl" ]; then
    echo "Creating CRL with broken signature..."
    cp intermediate-ca.crl intermediate-ca-broken-sig.crl
    # Corrupt a byte in the signature portion (assuming PEM format)
    if head -n 1 intermediate-ca-broken-sig.crl | grep -q "BEGIN"; then
        # Get total lines and corrupt near the end (signature area)
        TOTAL_LINES=$(wc -l < intermediate-ca-broken-sig.crl)
        CORRUPT_LINE=$((TOTAL_LINES - 2))
        sed -i "${CORRUPT_LINE}s/A/Z/" intermediate-ca-broken-sig.crl 2>/dev/null || \
        sed -i '' "${CORRUPT_LINE}s/A/Z/" intermediate-ca-broken-sig.crl 2>/dev/null || true
    fi
fi

# 6. Malformed CRL (truncated)
if [ -f "root-ca.crl" ]; then
    echo "Creating malformed CRL..."
    head -n 5 root-ca.crl > root-ca-malformed.crl
fi

# 7. Malformed CRL (invalid DER)
echo "Creating invalid DER CRL..."
echo "This is not a valid CRL" > intermediate-ca-invalid.dcrl

# Convert valid CRLs to DER format
[ -f "root-ca.crl" ] && openssl crl -in root-ca.crl -outform DER -out root-ca.dcrl 2>/dev/null || true
[ -f "intermediate-ca.crl" ] && openssl crl -in intermediate-ca.crl -outform DER -out intermediate-ca.dcrl 2>/dev/null || true
[ -f "intermediate-ca-v2.crl" ] && openssl crl -in intermediate-ca-v2.crl -outform DER -out intermediate-ca-v2.dcrl 2>/dev/null || true
[ -f "rogue-ca.crl" ] && openssl crl -in rogue-ca.crl -outform DER -out rogue-ca.dcrl 2>/dev/null || true

echo ""
echo "✅ Test PKI data generated in ${TEST_DIR}"
echo ""
echo "📦 Generated certificates:"
ls -lh *.crt 2>/dev/null | grep -v index || true
echo ""
echo "📋 Generated CRLs (PEM):"
ls -lh *.crl 2>/dev/null || true
echo ""
echo "📋 Generated CRLs (DER):"
ls -lh *.dcrl 2>/dev/null || true
echo ""
echo "🧪 Test cases included:"
echo "  - Valid CRLs with different CRL numbers"
echo "  - CRL from rogue CA (not in trust chain)"
echo "  - CRL with broken signature"
echo "  - Malformed/truncated CRLs"
echo "  - Invalid DER CRL"
echo "  - Revoked certificate entries"
