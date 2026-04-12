#!/bin/bash
set -euo pipefail

# Generate test PKI data for tests and local development
# Includes certificates with minimal and maximal extensions plus CRL edge cases

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_ROOT="${SCRIPT_DIR}/../tests/fixtures"
PKI_DIR="${FIXTURE_ROOT}/pki"

CERT_DIR="${PKI_DIR}/certs"
CA_CERT_DIR="${CERT_DIR}/ca"
LEAF_CERT_DIR="${CERT_DIR}/leaf"

CRL_DIR="${PKI_DIR}/crls"
CRL_FULL_DIR="${CRL_DIR}/full"
CRL_DELTA_DIR="${CRL_DIR}/delta"
CRL_BROKEN_DIR="${CRL_DIR}/broken"
CRL_INVALID_DIR="${CRL_DIR}/invalid"

SUPPORT_DIR="${PKI_DIR}/support"
KEY_DIR="${SUPPORT_DIR}/keys"
CSR_DIR="${SUPPORT_DIR}/csr"
SRL_DIR="${SUPPORT_DIR}/srl"
CA_DB_DIR="${SUPPORT_DIR}/ca-db"

ROOT_DB_DIR="${CA_DB_DIR}/root"
INTERMEDIATE_1_DB_DIR="${CA_DB_DIR}/intermediate-1"
INTERMEDIATE_2_DB_DIR="${CA_DB_DIR}/intermediate-2"
ROGUE_DB_DIR="${CA_DB_DIR}/rogue"

ROOT_KEY="${KEY_DIR}/root-ca.key.pem"
ROOT_CERT_PEM="${CA_CERT_DIR}/root-ca.cert.pem"
ROOT_CERT_DER="${CA_CERT_DIR}/root-ca.cert.der"

INTERMEDIATE_1_KEY="${KEY_DIR}/intermediate-ca-1.key.pem"
INTERMEDIATE_1_CSR="${CSR_DIR}/intermediate-ca-1.csr.pem"
INTERMEDIATE_1_CERT_PEM="${CA_CERT_DIR}/intermediate-ca-1.cert.pem"
INTERMEDIATE_1_CERT_DER="${CA_CERT_DIR}/intermediate-ca-1.cert.der"

INTERMEDIATE_2_KEY="${KEY_DIR}/intermediate-ca-2.key.pem"
INTERMEDIATE_2_CSR="${CSR_DIR}/intermediate-ca-2.csr.pem"
INTERMEDIATE_2_CERT_PEM="${CA_CERT_DIR}/intermediate-ca-2.cert.pem"
INTERMEDIATE_2_CERT_DER="${CA_CERT_DIR}/intermediate-ca-2.cert.der"

ROGUE_KEY="${KEY_DIR}/rogue-ca.key.pem"
ROGUE_CERT_PEM="${CA_CERT_DIR}/rogue-ca.cert.pem"
ROGUE_CERT_DER="${CA_CERT_DIR}/rogue-ca.cert.der"

LEAF_FULL_KEY="${KEY_DIR}/leaf-full.key.pem"
LEAF_FULL_CSR="${CSR_DIR}/leaf-full.csr.pem"
LEAF_FULL_CERT_PEM="${LEAF_CERT_DIR}/leaf-full.cert.pem"
LEAF_FULL_CERT_DER="${LEAF_CERT_DIR}/leaf-full.cert.der"

LEAF_MIN_KEY="${KEY_DIR}/leaf-min.key.pem"
LEAF_MIN_CSR="${CSR_DIR}/leaf-min.csr.pem"
LEAF_MIN_CERT_PEM="${LEAF_CERT_DIR}/leaf-min.cert.pem"
LEAF_MIN_CERT_DER="${LEAF_CERT_DIR}/leaf-min.cert.der"

LEAF_REVOKED_KEY="${KEY_DIR}/leaf-revoked.key.pem"
LEAF_REVOKED_CSR="${CSR_DIR}/leaf-revoked.csr.pem"
LEAF_REVOKED_CERT_PEM="${LEAF_CERT_DIR}/leaf-revoked.cert.pem"
LEAF_REVOKED_CERT_DER="${LEAF_CERT_DIR}/leaf-revoked.cert.der"

LEAF_SHORT_KEY="${KEY_DIR}/leaf-short.key.pem"
LEAF_SHORT_CSR="${CSR_DIR}/leaf-short.csr.pem"
LEAF_SHORT_CERT_PEM="${LEAF_CERT_DIR}/leaf-short.cert.pem"
LEAF_SHORT_CERT_DER="${LEAF_CERT_DIR}/leaf-short.cert.der"

ROOT_CRL_PEM="${CRL_FULL_DIR}/root-ca.crl.pem"
ROOT_CRL_DER="${CRL_FULL_DIR}/root-ca.crl.der"

ROGUE_CRL_PEM="${CRL_FULL_DIR}/rogue-ca.crl.pem"
ROGUE_CRL_DER="${CRL_FULL_DIR}/rogue-ca.crl.der"

BROKEN_CRL_PEM="${CRL_BROKEN_DIR}/intermediate-ca-1-crl-01-broken-sig.crl.pem"
MALFORMED_CRL_PEM="${CRL_INVALID_DIR}/root-ca-malformed.crl.pem"
INVALID_DER_CRL="${CRL_INVALID_DIR}/intermediate-ca-1-invalid-01.dcrl"

ROOT_CRL_CONF="${SUPPORT_DIR}/root-crl.cnf"
INTERMEDIATE_1_CRL_CONF="${SUPPORT_DIR}/intermediate-ca-1-crl.cnf"
INTERMEDIATE_2_CRL_CONF="${SUPPORT_DIR}/intermediate-ca-2-crl.cnf"
ROGUE_CRL_CONF="${SUPPORT_DIR}/rogue-crl.cnf"

FULL_CRL_PEMS=()
FULL_CRL_DERS=()
DELTA_CRL_PEMS=()
DELTA_CRL_DERS=()

mkdir -p "${FIXTURE_ROOT}"
rm -rf "${PKI_DIR}"
mkdir -p \
    "${CA_CERT_DIR}" \
    "${LEAF_CERT_DIR}" \
    "${CRL_FULL_DIR}" \
    "${CRL_DELTA_DIR}" \
    "${CRL_BROKEN_DIR}" \
    "${CRL_INVALID_DIR}" \
    "${KEY_DIR}" \
    "${CSR_DIR}" \
    "${SRL_DIR}" \
    "${ROOT_DB_DIR}" \
    "${INTERMEDIATE_1_DB_DIR}" \
    "${INTERMEDIATE_2_DB_DIR}" \
    "${ROGUE_DB_DIR}"

echo "1000" > "${SRL_DIR}/root-ca.srl"
echo "2000" > "${SRL_DIR}/intermediate-ca-1.srl"
echo "3000" > "${SRL_DIR}/intermediate-ca-2.srl"

init_ca_db() {
    local db_dir="$1"
    mkdir -p "${db_dir}/newcerts"
    : > "${db_dir}/index.txt"
    echo "1000" > "${db_dir}/serial"
    echo "01" > "${db_dir}/crlnumber"
}

write_crl_config() {
    local config="$1"
    local db_dir="$2"
    local key="$3"
    local cert="$4"
    cat > "${config}" <<EOF
[ ca ]
default_ca = CA_default

[ CA_default ]
database = ${db_dir}/index.txt
new_certs_dir = ${db_dir}/newcerts
serial = ${db_dir}/serial
crlnumber = ${db_dir}/crlnumber
private_key = ${key}
certificate = ${cert}
default_md = sha256
default_crl_days = 30
unique_subject = no
crl_extensions = crl_ext

[ crl_ext ]
authorityKeyIdentifier = keyid:always

[ crl_delta_base_1 ]
authorityKeyIdentifier = keyid:always
2.5.29.27 = critical,ASN1:INTEGER:1

[ crl_delta_base_2 ]
authorityKeyIdentifier = keyid:always
2.5.29.27 = critical,ASN1:INTEGER:2

[ crl_delta_base_3 ]
authorityKeyIdentifier = keyid:always
2.5.29.27 = critical,ASN1:INTEGER:3

[ crl_delta_base_4 ]
authorityKeyIdentifier = keyid:always
2.5.29.27 = critical,ASN1:INTEGER:4

[ crl_delta_base_5 ]
authorityKeyIdentifier = keyid:always
2.5.29.27 = critical,ASN1:INTEGER:5
EOF
}

to_der_cert() {
    local in_pem="$1"
    local out_der="$2"
    openssl x509 -in "${in_pem}" -outform DER -out "${out_der}"
}

to_der_crl() {
    local in_pem="$1"
    local out_der="$2"
    openssl crl -in "${in_pem}" -outform DER -out "${out_der}"
}

corrupt_pem_signature() {
    local source="$1"
    local target="$2"
    cp "${source}" "${target}"
    if head -n 1 "${target}" | grep -q "BEGIN"; then
        local total_lines
        total_lines=$(wc -l < "${target}")
        local corrupt_line=$((total_lines - 2))
        sed -i "${corrupt_line}s/A/Z/" "${target}" 2>/dev/null || \
            sed -i '' "${corrupt_line}s/A/Z/" "${target}" 2>/dev/null || true
    fi
}

gen_full_crls() {
    local config="$1"
    local db_dir="$2"
    local prefix="$3"
    local count="$4"
    local start_number="$5"
    local i=1
    while [ "${i}" -le "${count}" ]; do
        local seq
        seq=$(printf "%02d" "${i}")
        local crl_no_dec=$((start_number + i - 1))
        local crl_no_hex
        crl_no_hex=$(printf "%02X" "${crl_no_dec}")
        local pem="${CRL_FULL_DIR}/${prefix}-crl-${seq}.crl.pem"
        local der="${CRL_FULL_DIR}/${prefix}-crl-${seq}.crl.der"

        echo "${crl_no_hex}" > "${db_dir}/crlnumber"
        openssl ca -gencrl -config "${config}" -out "${pem}" -batch 2>/dev/null || true

        FULL_CRL_PEMS+=("${pem}")
        FULL_CRL_DERS+=("${der}")
        i=$((i + 1))
    done
}

gen_delta_crls() {
    local config="$1"
    local db_dir="$2"
    local prefix="$3"
    local count="$4"
    local start_number="$5"
    local base_extension_offset="$6"
    local i=1
    while [ "${i}" -le "${count}" ]; do
        local seq
        seq=$(printf "%02d" "${i}")
        local crl_no_dec=$((start_number + i - 1))
        local crl_no_hex
        crl_no_hex=$(printf "%02X" "${crl_no_dec}")
        local ext_idx=$((base_extension_offset + i - 1))
        local pem="${CRL_DELTA_DIR}/${prefix}-delta-${seq}.crl.pem"
        local der="${CRL_DELTA_DIR}/${prefix}-delta-${seq}.dcrl"

        echo "${crl_no_hex}" > "${db_dir}/crlnumber"
        openssl ca -gencrl -config "${config}" -crlexts "crl_delta_base_${ext_idx}" \
            -out "${pem}" -batch 2>/dev/null || true

        DELTA_CRL_PEMS+=("${pem}")
        DELTA_CRL_DERS+=("${der}")
        i=$((i + 1))
    done
}

echo "Generating test PKI data..."

init_ca_db "${ROOT_DB_DIR}"
init_ca_db "${INTERMEDIATE_1_DB_DIR}"
init_ca_db "${INTERMEDIATE_2_DB_DIR}"
init_ca_db "${ROGUE_DB_DIR}"

write_crl_config "${ROOT_CRL_CONF}" "${ROOT_DB_DIR}" "${ROOT_KEY}" "${ROOT_CERT_PEM}"
write_crl_config "${INTERMEDIATE_1_CRL_CONF}" "${INTERMEDIATE_1_DB_DIR}" "${INTERMEDIATE_1_KEY}" "${INTERMEDIATE_1_CERT_PEM}"
write_crl_config "${INTERMEDIATE_2_CRL_CONF}" "${INTERMEDIATE_2_DB_DIR}" "${INTERMEDIATE_2_KEY}" "${INTERMEDIATE_2_CERT_PEM}"
write_crl_config "${ROGUE_CRL_CONF}" "${ROGUE_DB_DIR}" "${ROGUE_KEY}" "${ROGUE_CERT_PEM}"

echo "Creating root CA..."
openssl genrsa -out "${ROOT_KEY}" 2048
openssl req -new -x509 -days 3650 -key "${ROOT_KEY}" -out "${ROOT_CERT_PEM}" \
    -subj "/C=US/ST=Test/L=TestCity/O=TestOrg/OU=TestRoot/CN=Test Root CA" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -addext "subjectKeyIdentifier=hash" \
    -addext "authorityKeyIdentifier=keyid:always"
to_der_cert "${ROOT_CERT_PEM}" "${ROOT_CERT_DER}"

echo "Creating intermediate CA #1..."
openssl genrsa -out "${INTERMEDIATE_1_KEY}" 2048
openssl req -new -key "${INTERMEDIATE_1_KEY}" -out "${INTERMEDIATE_1_CSR}" \
    -subj "/C=US/ST=Test/L=TestCity/O=TestOrg/OU=TestIntermediate1/CN=Test Intermediate CA 1"
openssl x509 -req -in "${INTERMEDIATE_1_CSR}" -CA "${ROOT_CERT_PEM}" -CAkey "${ROOT_KEY}" \
    -CAserial "${SRL_DIR}/root-ca.srl" -out "${INTERMEDIATE_1_CERT_PEM}" -days 1825 \
    -extfile <(cat <<EOF
[v3_intermediate]
basicConstraints=critical,CA:TRUE,pathlen:0
keyUsage=critical,keyCertSign,cRLSign
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid,issuer
crlDistributionPoints=URI:http://example.test/crl/root-ca.crl.pem
authorityInfoAccess=caIssuers;URI:http://example.test/ca/root-ca.crt
EOF
    ) -extensions v3_intermediate
to_der_cert "${INTERMEDIATE_1_CERT_PEM}" "${INTERMEDIATE_1_CERT_DER}"

echo "Creating intermediate CA #2..."
openssl genrsa -out "${INTERMEDIATE_2_KEY}" 2048
openssl req -new -key "${INTERMEDIATE_2_KEY}" -out "${INTERMEDIATE_2_CSR}" \
    -subj "/C=US/ST=Test/L=TestCity/O=TestOrg/OU=TestIntermediate2/CN=Test Intermediate CA 2"
openssl x509 -req -in "${INTERMEDIATE_2_CSR}" -CA "${ROOT_CERT_PEM}" -CAkey "${ROOT_KEY}" \
    -CAserial "${SRL_DIR}/root-ca.srl" -out "${INTERMEDIATE_2_CERT_PEM}" -days 1825 \
    -extfile <(cat <<EOF
[v3_intermediate]
basicConstraints=critical,CA:TRUE,pathlen:0
keyUsage=critical,keyCertSign,cRLSign
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid,issuer
crlDistributionPoints=URI:http://example.test/crl/root-ca.crl.pem
authorityInfoAccess=caIssuers;URI:http://example.test/ca/root-ca.crt
EOF
    ) -extensions v3_intermediate
to_der_cert "${INTERMEDIATE_2_CERT_PEM}" "${INTERMEDIATE_2_CERT_DER}"

echo "Creating rogue CA..."
openssl genrsa -out "${ROGUE_KEY}" 2048
openssl req -new -x509 -days 3650 -key "${ROGUE_KEY}" -out "${ROGUE_CERT_PEM}" \
    -subj "/C=XX/ST=Rogue/L=RogueCity/O=RogueOrg/OU=RogueUnit/CN=Rogue CA" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -addext "subjectKeyIdentifier=hash"
to_der_cert "${ROGUE_CERT_PEM}" "${ROGUE_CERT_DER}"

echo "Creating leaf certificates..."
openssl genrsa -out "${LEAF_FULL_KEY}" 2048
openssl req -new -key "${LEAF_FULL_KEY}" -out "${LEAF_FULL_CSR}" \
    -subj "/C=US/ST=Test/L=TestCity/O=TestOrg/OU=TestUnit/CN=Leaf Certificate"
openssl x509 -req -in "${LEAF_FULL_CSR}" -CA "${INTERMEDIATE_1_CERT_PEM}" -CAkey "${INTERMEDIATE_1_KEY}" \
    -CAserial "${SRL_DIR}/intermediate-ca-1.srl" -out "${LEAF_FULL_CERT_PEM}" -days 365 \
    -extfile <(cat <<EOF
[v3_leaf_full]
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment,keyAgreement
extendedKeyUsage=serverAuth,clientAuth,codeSigning,emailProtection
subjectAltName=DNS:leaf.example.test,DNS:leaf.example.com,IP:192.0.2.10,URI:http://example.test,email:leaf@example.test
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid,issuer
crlDistributionPoints=URI:http://example.test/crl/intermediate-ca-1-crl-01.crl.pem
authorityInfoAccess=OCSP;URI:http://ocsp.example.test,caIssuers;URI:http://example.test/ca/intermediate-ca-1.crt
EOF
    ) -extensions v3_leaf_full
to_der_cert "${LEAF_FULL_CERT_PEM}" "${LEAF_FULL_CERT_DER}"

openssl genrsa -out "${LEAF_MIN_KEY}" 2048
openssl req -new -key "${LEAF_MIN_KEY}" -out "${LEAF_MIN_CSR}" \
    -subj "/C=US/ST=Test/L=TestCity/O=TestOrg/OU=TestUnit/CN=Minimal Leaf"
openssl x509 -req -in "${LEAF_MIN_CSR}" -CA "${INTERMEDIATE_1_CERT_PEM}" -CAkey "${INTERMEDIATE_1_KEY}" \
    -CAserial "${SRL_DIR}/intermediate-ca-1.srl" -out "${LEAF_MIN_CERT_PEM}" -days 365 \
    -extfile <(cat <<EOF
[v3_leaf_min]
basicConstraints=critical,CA:FALSE
EOF
    ) -extensions v3_leaf_min
to_der_cert "${LEAF_MIN_CERT_PEM}" "${LEAF_MIN_CERT_DER}"

openssl genrsa -out "${LEAF_REVOKED_KEY}" 2048
openssl req -new -key "${LEAF_REVOKED_KEY}" -out "${LEAF_REVOKED_CSR}" \
    -subj "/C=US/ST=Test/L=TestCity/O=TestOrg/OU=TestUnit/CN=Revoked Leaf"
openssl x509 -req -in "${LEAF_REVOKED_CSR}" -CA "${INTERMEDIATE_1_CERT_PEM}" -CAkey "${INTERMEDIATE_1_KEY}" \
    -CAserial "${SRL_DIR}/intermediate-ca-1.srl" -out "${LEAF_REVOKED_CERT_PEM}" -days 365 \
    -extfile <(cat <<EOF
[v3_leaf_revoked]
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
EOF
    ) -extensions v3_leaf_revoked
to_der_cert "${LEAF_REVOKED_CERT_PEM}" "${LEAF_REVOKED_CERT_DER}"

openssl genrsa -out "${LEAF_SHORT_KEY}" 2048
openssl req -new -key "${LEAF_SHORT_KEY}" -out "${LEAF_SHORT_CSR}" \
    -subj "/C=US/ST=Test/L=TestCity/O=TestOrg/OU=TestUnit/CN=Short Lived Leaf"
openssl x509 -req -in "${LEAF_SHORT_CSR}" -CA "${INTERMEDIATE_1_CERT_PEM}" -CAkey "${INTERMEDIATE_1_KEY}" \
    -CAserial "${SRL_DIR}/intermediate-ca-1.srl" -out "${LEAF_SHORT_CERT_PEM}" -days 2 \
    -extfile <(cat <<EOF
[v3_leaf_short]
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
EOF
    ) -extensions v3_leaf_short
to_der_cert "${LEAF_SHORT_CERT_PEM}" "${LEAF_SHORT_CERT_DER}"

revoked_serial=$(openssl x509 -in "${LEAF_REVOKED_CERT_PEM}" -noout -serial | cut -d= -f2)
revoked_subject="/C=US/ST=Test/L=TestCity/O=TestOrg/OU=TestUnit/CN=Revoked Leaf"
revocation_date=$(date -u +%y%m%d%H%M%SZ)
expiration_date=$(date -u +%y%m%d%H%M%SZ -d '+365 days')
printf "R\t%s\t%s\t%s\tunknown\t%s\n" \
    "${expiration_date}" \
    "${revocation_date}" \
    "${revoked_serial}" \
    "${revoked_subject}" \
    >> "${INTERMEDIATE_1_DB_DIR}/index.txt"

openssl genrsa -out "${KEY_DIR}/leaf-intermediate-2-revoked.key.pem" 2048
openssl req -new -key "${KEY_DIR}/leaf-intermediate-2-revoked.key.pem" -out "${CSR_DIR}/leaf-intermediate-2-revoked.csr.pem" \
    -subj "/C=US/ST=Test/L=TestCity/O=TestOrg/OU=TestUnit/CN=Revoked Leaf Intermediate 2"
openssl x509 -req -in "${CSR_DIR}/leaf-intermediate-2-revoked.csr.pem" -CA "${INTERMEDIATE_2_CERT_PEM}" -CAkey "${INTERMEDIATE_2_KEY}" \
    -CAserial "${SRL_DIR}/intermediate-ca-2.srl" -out "${LEAF_CERT_DIR}/leaf-intermediate-2-revoked.cert.pem" -days 365 \
    -extfile <(cat <<EOF
[v3_leaf_revoked]
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
EOF
    ) -extensions v3_leaf_revoked

revoked_serial_2=$(openssl x509 -in "${LEAF_CERT_DIR}/leaf-intermediate-2-revoked.cert.pem" -noout -serial | cut -d= -f2)
revoked_subject_2="/C=US/ST=Test/L=TestCity/O=TestOrg/OU=TestUnit/CN=Revoked Leaf Intermediate 2"
printf "R\t%s\t%s\t%s\tunknown\t%s\n" \
    "${expiration_date}" \
    "${revocation_date}" \
    "${revoked_serial_2}" \
    "${revoked_subject_2}" \
    >> "${INTERMEDIATE_2_DB_DIR}/index.txt"

echo "Generating CRLs..."
openssl ca -gencrl -config "${ROOT_CRL_CONF}" -out "${ROOT_CRL_PEM}" -batch 2>/dev/null || true
gen_full_crls "${INTERMEDIATE_1_CRL_CONF}" "${INTERMEDIATE_1_DB_DIR}" "intermediate-ca-1" 3 1
gen_full_crls "${INTERMEDIATE_2_CRL_CONF}" "${INTERMEDIATE_2_DB_DIR}" "intermediate-ca-2" 2 21

gen_delta_crls "${INTERMEDIATE_1_CRL_CONF}" "${INTERMEDIATE_1_DB_DIR}" "intermediate-ca-1" 3 41 1
gen_delta_crls "${INTERMEDIATE_2_CRL_CONF}" "${INTERMEDIATE_2_DB_DIR}" "intermediate-ca-2" 2 61 4

openssl ca -gencrl -config "${ROGUE_CRL_CONF}" -out "${ROGUE_CRL_PEM}" -batch 2>/dev/null || true

if [ -f "${CRL_FULL_DIR}/intermediate-ca-1-crl-01.crl.pem" ]; then
    corrupt_pem_signature "${CRL_FULL_DIR}/intermediate-ca-1-crl-01.crl.pem" "${BROKEN_CRL_PEM}"
fi

if [ -f "${ROOT_CRL_PEM}" ]; then
    head -n 5 "${ROOT_CRL_PEM}" > "${MALFORMED_CRL_PEM}"
fi

echo "This is not a valid CRL" > "${INVALID_DER_CRL}"

if [ -f "${ROOT_CRL_PEM}" ]; then
    to_der_crl "${ROOT_CRL_PEM}" "${ROOT_CRL_DER}"
fi
if [ -f "${ROGUE_CRL_PEM}" ]; then
    to_der_crl "${ROGUE_CRL_PEM}" "${ROGUE_CRL_DER}"
fi

for i in "${!FULL_CRL_PEMS[@]}"; do
    if [ -f "${FULL_CRL_PEMS[$i]}" ]; then
        to_der_crl "${FULL_CRL_PEMS[$i]}" "${FULL_CRL_DERS[$i]}"
    fi
done

for i in "${!DELTA_CRL_PEMS[@]}"; do
    if [ -f "${DELTA_CRL_PEMS[$i]}" ]; then
        to_der_crl "${DELTA_CRL_PEMS[$i]}" "${DELTA_CRL_DERS[$i]}"
    fi
done

echo ""
echo "Test PKI data generated in ${PKI_DIR}"
echo "Certificates: ${CA_CERT_DIR}, ${LEAF_CERT_DIR}"
echo "CRLs: ${CRL_DIR}"
echo "Support files: ${SUPPORT_DIR}"
