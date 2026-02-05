# PKI AIA/CDP Worker - API Design v2

## Overview

This document outlines the redesigned REST API for the PKI AIA/CDP Worker. The API follows RESTful best practices with consistent resource naming, proper HTTP methods, and standardized response formats.

## Design Principles

1. **Resource-Oriented**: URLs represent resources (nouns), not actions (verbs)
2. **Consistent Naming**: Use plural nouns for collections, kebab-case for multi-word resources
3. **Proper HTTP Methods**: GET for reading, POST for creating, PUT for replacing, PATCH for partial updates, DELETE for removing
4. **Standardized Responses**: Consistent JSON envelope with `data`, `meta`, and `error` fields
5. **HATEOAS Links**: Include navigational links in responses
6. **Pagination**: Cursor-based pagination for collections
7. **Filtering/Ordering**: Query parameters for filtering and ordering where supported
8. **Proper Status Codes**: Semantic HTTP status codes
9. **Format Deduplication**: When a resource is available in multiple formats (e.g., DER and PEM), the API returns a single logical item representing the canonical DER format. Alternative formats are available via URL path extensions.

---

## Base URL Structure

```
/api/v2
```

All API endpoints are prefixed with `/api/v2`. Binary download endpoints remain at root level for direct URL usage in PKI configurations.

---

## Format Deduplication (API Design Principle #9)

### Overview

When a resource (certificate or CRL) is available in multiple formats (typically DER and PEM), the API applies format deduplication:

1. **API Responses**: Only return information about the canonical DER format
2. **List Endpoints**: Only one entry per resource (merged from DER and PEM variants)
3. **Detail Endpoints**: Always describe the DER representation, regardless of how the resource was requested
4. **Format Access**: Clients can access alternative formats (PEM) via URL path extensions

### How It Works

For each resource, metadata fields always represent the **canonical DER format**:

```typescript
storage: {
  filename: string;
  format: "der"; // Always "der" - the canonical format
  size: number; // Size of DER-encoded data
  uploadedAt: string;
  etag: string;
}
```

### Accessing Alternative Formats

To download a resource in PEM format, clients can transform the `downloadUrl`:

**Example for Certificates:**

- **DER format**: `/ca/root-ca.crt`
- **PEM format**: `/ca/root-ca.crt.pem` (append `.pem`)

**Example for CRLs:**

- **DER format**: `/crl/root-ca.crl`
- **PEM format**: `/crl/root-ca.crl.pem` (append `.pem`)

### Implementation Details

- Both DER and PEM files are stored in R2 storage
- When listing resources, duplicates (DER and PEM of the same certificate/CRL) are merged into a single entry
- The merged entry always represents the canonical DER version
- API responses always report canonical DER metadata, even if accessed via a `.pem` URL

---

## Resource Types

| Resource       | Description                                                             |
| -------------- | ----------------------------------------------------------------------- |
| `certificates` | CA certificates (stored under `ca/` prefix)                             |
| `crls`         | Certificate Revocation Lists (stored under `crl/` and `dcrl/` prefixes) |
| `revocations`  | Individual revocation entries within CRLs                               |

---

## Response Envelope

All JSON responses follow this structure:

```typescript
interface ApiResponse<T> {
  data: T | null;
  meta: ResponseMeta | null;
  error: ApiError | null;
}

interface ResponseMeta {
  requestId?: string;
  timestamp: string;
  cached?: boolean;
  cacheAge?: number;
  links?: Record<string, string>;
  pagination?: PaginationMeta;
}

interface PaginationMeta {
  cursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
  pageSize: number;
  totalCount?: number; // When available
}

interface ApiError {
  code: string; // Machine-readable error code
  message: string; // Human-readable message
  details?: unknown; // Additional error context
  field?: string; // For validation errors
}
```

---

## Endpoints

### 1. Certificates

#### List Certificates

```
GET /api/v2/certificates
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `cursor` | string | - | Pagination cursor |
| `limit` | number | 50 | Items per page (1-100) |
| `search` | string | - | Search by subject/issuer CN |

**Notes:**

- Results are returned in storage key order. Explicit sorting is not currently supported.
- Status and expiry timing are computed client-side from `summary.thisUpdate` and `summary.nextUpdate`.
- Status and expiry timing are computed client-side from `summary.notBefore` and `summary.notAfter`.

**Response:**

```typescript
interface CertificateListItem {
  id: string; // URL-safe key (e.g., "root-ca.crt")
  type: "certificate";
  href: string; // API URL for this certificate
  downloadUrl: string; // Direct download URL (DER format, append .pem for PEM)

  storage: {
    filename: string;
    format: "der"; // Always canonical DER format (API design principle #9)
    size: number; // Size of DER-encoded certificate
    uploadedAt: string; // ISO 8601
  };

  summary: {
    subjectCN: string | null;
    issuerCN: string | null;
    notBefore: string | null;
    notAfter: string | null;
    serialNumber: string | null;
  };

  fingerprints: {
    sha1: string;
    sha256: string;
  };
}
```

**Format Availability:**

For each certificate returned, both representations are available for download:

| Format | URL Pattern                  |
| ------ | ---------------------------- |
| DER    | `/{id}` (from `downloadUrl`) |
| PEM    | `/{id}.pem`                  |

Example:

- DER: `/ca/root-ca.crt`
- PEM: `/ca/root-ca.crt.pem`

**Note:** The API always returns metadata for the canonical DER format. To get the PEM-encoded version of the certificate, append `.pem` to the `downloadUrl`.

**Example Response:**

```json
{
  "data": [
    {
      "id": "root-ca.crt",
      "type": "certificate",
      "href": "/api/v2/certificates/root-ca.crt",
      "downloadUrl": "/ca/root-ca.crt",
      "storage": {
        "filename": "root-ca.crt",
        "format": "der",
        "size": 1234,
        "uploadedAt": "2025-01-15T10:30:00Z"
      },
      "summary": {
        "subjectCN": "Example Root CA",
        "issuerCN": "Example Root CA",
        "notBefore": "2024-01-01T00:00:00Z",
        "notAfter": "2034-01-01T00:00:00Z",
        "serialNumber": "01"
      },
      "fingerprints": {
        "sha1": "...",
        "sha256": "..."
      }
    }
  ],
  "meta": {
    "timestamp": "2026-02-04T12:00:00Z",
    "cached": true,
    "cacheAge": 45,
    "pagination": {
      "cursor": null,
      "nextCursor": "eyJrIjoiY2EvaW50ZXJtZWRpYXRlLmNydCJ9",
      "hasMore": true,
      "pageSize": 50
    },
    "links": {
      "self": "/api/v2/certificates",
      "next": "/api/v2/certificates?cursor=eyJrIjoiY2EvaW50ZXJtZWRpYXRlLmNydCJ9"
    }
  },
  "error": null
}
```

---

#### Get Certificate Details

```
GET /api/v2/certificates/{id}
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Certificate identifier (filename) |

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `include` | string | - | Comma-separated optional sections to include |

**Include Options:**

- `extensions` - Parsed X.509v3 extensions
- `signatureAlgorithm` - Signature algorithm details
- `signatureValue` - Signature bytes (hex)

**Notes:**

- `tbsCertificate` is always included.
- If `include` is omitted, the response includes extensions and signature fields by default.
- If `include` is provided, only the listed optional sections are included.
- Status and expiry timing are computed client-side from `tbsCertificate.validity`.

**Response Structure (X.509 Aligned):**

The response follows the X.509 Certificate ASN.1 structure (RFC 5280):

```
Certificate ::= SEQUENCE {
    tbsCertificate       TBSCertificate,
    signatureAlgorithm   AlgorithmIdentifier,
    signatureValue       BIT STRING
}
```

```typescript
interface CertificateDetail {
  // === Resource Metadata ===
  id: string; // Canonical DER identifier (e.g., "root-ca.crt")
  type: "certificate";
  href: string; // Link to this resource (always points to canonical DER version)
  downloadUrl: string; // Download link (always DER format, append .pem for PEM)

  // === Storage Metadata ===
  storage: {
    filename: string;
    format: "der"; // Always canonical DER format (API design principle #9)
    size: number; // Size of DER-encoded certificate
    uploadedAt: string; // ISO 8601
    etag: string;
  };

  // === Computed Fields ===
  fingerprints: {
    sha1: string;
    sha256: string;
  };

  // === X.509 TBSCertificate (RFC 5280 §4.1.2) ===
  tbsCertificate: {
    version: X509Version;
    serialNumber: SerialNumber;
    signature: AlgorithmIdentifier; // Algorithm used to sign
    issuer: Name;
    validity: Validity;
    subject: Name;
    subjectPublicKeyInfo: SubjectPublicKeyInfo;

    // Optional X.509v2/v3 fields
    issuerUniqueID?: BitString; // Rarely used
    subjectUniqueID?: BitString; // Rarely used
    extensions?: Extensions; // X.509v3
  };

  // === Outer Signature (RFC 5280 §4.1.1) ===
  signatureAlgorithm?: AlgorithmIdentifier;
  signatureValue?: BitString;

  // === Relationships ===
  relationships: {
    issuer?: RelationshipLink;
    issuedCrls?: RelationshipLink[];
  };
}

// === X.509 Primitive Types ===

interface X509Version {
  raw: number; // 0, 1, or 2
  display: "v1" | "v2" | "v3"; // Human-readable
}

interface SerialNumber {
  hex: string; // Raw hex bytes
  decimal?: string; // Decimal string (if reasonable size)
}

interface BitString {
  hex: string; // Raw hex bytes
  bitLength: number;
  unusedBits: number;
}

// === AlgorithmIdentifier (RFC 5280 §4.1.1.2) ===
interface AlgorithmIdentifier {
  algorithm: ObjectIdentifier;
  parameters?: AlgorithmParameters;
}

interface ObjectIdentifier {
  oid: string; // Dotted decimal (e.g., "1.2.840.113549.1.1.11")
  name: string | null; // Resolved name (e.g., "sha256WithRSAEncryption")
}

interface AlgorithmParameters {
  parsed?: unknown; // Algorithm-specific parsed value
  rawHex: string; // Always include raw for unparsed params
}

// === Name / Distinguished Name (RFC 5280 §4.1.2.4) ===
interface Name {
  // Normalized common fields for easy access
  commonName: string | null;
  organization: string | null;
  organizationalUnit: string | null;
  country: string | null;
  stateOrProvince: string | null;
  locality: string | null;

  // Full RDN sequence preserving order and multi-value RDNs
  rdnSequence: RelativeDistinguishedName[];
}

interface RelativeDistinguishedName {
  // A single RDN can have multiple AttributeTypeAndValue (multi-value RDN)
  attributes: AttributeTypeAndValue[];
}

interface AttributeTypeAndValue {
  type: ObjectIdentifier;
  value: AttributeValue;
}

interface AttributeValue {
  // Parsed string value when possible
  string: string | null;
  // Original encoding type
  encoding:
    | "utf8String"
    | "printableString"
    | "ia5String"
    | "bmpString"
    | "universalString"
    | "unknown";
  // Raw hex for non-string or unparsable values
  rawHex?: string;
}

// === Validity (RFC 5280 §4.1.2.5) ===
interface Validity {
  notBefore: Time;
  notAfter: Time;
}

interface Time {
  // ISO 8601 parsed value
  iso: string;
  // Original ASN.1 type
  type: "utcTime" | "generalizedTime";
  // Raw string as encoded
  raw: string;
}

// === SubjectPublicKeyInfo (RFC 5280 §4.1.2.7) ===
interface SubjectPublicKeyInfo {
  algorithm: AlgorithmIdentifier;
  subjectPublicKey: BitString;

  // Parsed key details (algorithm-specific)
  parsed?: RSAPublicKey | ECPublicKey | EdPublicKey | UnknownPublicKey;

  // Key fingerprints
  fingerprints: {
    sha1: string;
    sha256: string;
  };
}

interface RSAPublicKey {
  type: "rsa";
  modulus: {
    hex: string;
    bitLength: number;
  };
  publicExponent: number;
}

interface ECPublicKey {
  type: "ec";
  curve: ObjectIdentifier;
  point: {
    hex: string;
    // Uncompressed point coordinates if parseable
    x?: string;
    y?: string;
  };
  keySize: number;
}

interface EdPublicKey {
  type: "ed25519" | "ed448";
  publicKey: {
    hex: string;
  };
}

interface UnknownPublicKey {
  type: "unknown";
  // Raw data preserved
}

// === Extensions (RFC 5280 §4.2) ===
interface Extensions {
  // Count for UI display
  count: number;
  critical: number;

  // All extensions in order
  items: Extension[];
}

interface Extension {
  // Extension identification
  extnID: ObjectIdentifier;
  critical: boolean;

  // Raw extension value (always present)
  extnValue: {
    hex: string;
    byteLength: number;
  };

  // Parsing status
  parseStatus: "parsed" | "unsupported" | "error";
  parseError?: string;

  // Parsed value (structure depends on extension type)
  parsed?: ParsedExtensionValue;
}

// === Parsed Extension Values ===
// Each known extension type has a specific parsed structure

type ParsedExtensionValue =
  | BasicConstraintsValue
  | KeyUsageValue
  | ExtendedKeyUsageValue
  | SubjectAltNameValue
  | AuthorityKeyIdentifierValue
  | SubjectKeyIdentifierValue
  | CRLDistributionPointsValue
  | AuthorityInfoAccessValue
  | CertificatePoliciesValue
  | NameConstraintsValue
  | UnknownExtensionValue;

interface BasicConstraintsValue {
  extensionType: "basicConstraints";
  cA: boolean;
  pathLenConstraint?: number;
}

interface KeyUsageValue {
  extensionType: "keyUsage";
  // Individual flags
  digitalSignature: boolean;
  nonRepudiation: boolean;
  keyEncipherment: boolean;
  dataEncipherment: boolean;
  keyAgreement: boolean;
  keyCertSign: boolean;
  cRLSign: boolean;
  encipherOnly: boolean;
  decipherOnly: boolean;
  // List of active usages for display
  usages: string[];
}

interface ExtendedKeyUsageValue {
  extensionType: "extendedKeyUsage";
  purposes: ObjectIdentifier[];
}

interface SubjectAltNameValue {
  extensionType: "subjectAltName";
  names: GeneralName[];
}

interface GeneralName {
  type:
    | "otherName"
    | "rfc822Name"
    | "dNSName"
    | "x400Address"
    | "directoryName"
    | "ediPartyName"
    | "uniformResourceIdentifier"
    | "iPAddress"
    | "registeredID";
  value: string;
  // For otherName, include the type OID
  typeOid?: string;
  // Raw hex for complex types
  rawHex?: string;
}

interface AuthorityKeyIdentifierValue {
  extensionType: "authorityKeyIdentifier";
  keyIdentifier?: string; // Hex
  authorityCertIssuer?: GeneralName[];
  authorityCertSerialNumber?: string;
}

interface SubjectKeyIdentifierValue {
  extensionType: "subjectKeyIdentifier";
  keyIdentifier: string; // Hex
}

interface CRLDistributionPointsValue {
  extensionType: "cRLDistributionPoints";
  distributionPoints: DistributionPoint[];
}

interface DistributionPoint {
  distributionPoint?: {
    fullName?: GeneralName[];
    nameRelativeToCRLIssuer?: RelativeDistinguishedName;
  };
  reasons?: string[]; // Reason flags
  cRLIssuer?: GeneralName[];
}

interface AuthorityInfoAccessValue {
  extensionType: "authorityInfoAccess";
  accessDescriptions: AccessDescription[];
}

interface AccessDescription {
  accessMethod: ObjectIdentifier;
  accessLocation: GeneralName;
}

interface CertificatePoliciesValue {
  extensionType: "certificatePolicies";
  policies: PolicyInformation[];
}

interface PolicyInformation {
  policyIdentifier: ObjectIdentifier;
  policyQualifiers?: PolicyQualifier[];
}

interface PolicyQualifier {
  qualifierId: ObjectIdentifier;
  qualifier?: string | unknown;
  rawHex?: string;
}

interface NameConstraintsValue {
  extensionType: "nameConstraints";
  permittedSubtrees?: GeneralSubtree[];
  excludedSubtrees?: GeneralSubtree[];
}

interface GeneralSubtree {
  base: GeneralName;
  minimum?: number;
  maximum?: number;
}

interface UnknownExtensionValue {
  extensionType: "unknown";
  // Only raw hex available
}

interface RelationshipLink {
  id: string;
  type: string;
  href: string;
}
```

**Example Response:**

```json
{
  "data": {
    "id": "root-ca.crt",
    "type": "certificate",
    "href": "/api/v2/certificates/root-ca.crt",
    "downloadUrl": "/ca/root-ca.crt",
    "storage": {
      "filename": "root-ca.crt",
      "format": "der",
      "size": 1234,
      "uploadedAt": "2025-01-15T10:30:00Z",
      "etag": "abc123"
    },
    "fingerprints": {
      "sha1": "A1B2C3D4E5...",
      "sha256": "1234567890ABCDEF..."
    },
    "tbsCertificate": {
      "version": { "raw": 2, "display": "v3" },
      "serialNumber": { "hex": "01", "decimal": "1" },
      "signature": {
        "algorithm": {
          "oid": "1.2.840.113549.1.1.11",
          "name": "sha256WithRSAEncryption"
        }
      },
      "issuer": {
        "commonName": "Example Root CA",
        "organization": "Example Corp",
        "country": "US",
        "rdnSequence": [
          {
            "attributes": [
              {
                "type": { "oid": "2.5.4.6", "name": "countryName" },
                "value": { "string": "US", "encoding": "printableString" }
              }
            ]
          },
          {
            "attributes": [
              {
                "type": { "oid": "2.5.4.10", "name": "organizationName" },
                "value": { "string": "Example Corp", "encoding": "utf8String" }
              }
            ]
          },
          {
            "attributes": [
              {
                "type": { "oid": "2.5.4.3", "name": "commonName" },
                "value": {
                  "string": "Example Root CA",
                  "encoding": "utf8String"
                }
              }
            ]
          }
        ]
      },
      "validity": {
        "notBefore": {
          "iso": "2024-01-01T00:00:00Z",
          "type": "utcTime",
          "raw": "240101000000Z"
        },
        "notAfter": {
          "iso": "2034-01-01T00:00:00Z",
          "type": "utcTime",
          "raw": "340101000000Z"
        }
      },
      "subject": {
        "commonName": "Example Root CA",
        "organization": "Example Corp",
        "country": "US",
        "rdnSequence": [
          /* ... */
        ]
      },
      "subjectPublicKeyInfo": {
        "algorithm": {
          "algorithm": {
            "oid": "1.2.840.113549.1.1.1",
            "name": "rsaEncryption"
          }
        },
        "subjectPublicKey": {
          "hex": "...",
          "bitLength": 2048,
          "unusedBits": 0
        },
        "parsed": {
          "type": "rsa",
          "modulus": { "hex": "...", "bitLength": 2048 },
          "publicExponent": 65537
        },
        "fingerprints": { "sha1": "...", "sha256": "..." }
      },
      "extensions": {
        "count": 5,
        "critical": 2,
        "items": [
          {
            "extnID": { "oid": "2.5.29.19", "name": "basicConstraints" },
            "critical": true,
            "extnValue": { "hex": "30030101FF", "byteLength": 5 },
            "parseStatus": "parsed",
            "parsed": {
              "extensionType": "basicConstraints",
              "cA": true
            }
          },
          {
            "extnID": { "oid": "2.5.29.15", "name": "keyUsage" },
            "critical": true,
            "extnValue": { "hex": "03020106", "byteLength": 4 },
            "parseStatus": "parsed",
            "parsed": {
              "extensionType": "keyUsage",
              "digitalSignature": false,
              "keyCertSign": true,
              "cRLSign": true,
              "usages": ["keyCertSign", "cRLSign"]
            }
          },
          {
            "extnID": { "oid": "1.3.6.1.4.1.99999.1.2.3", "name": null },
            "critical": false,
            "extnValue": {
              "hex": "0C0B48656C6C6F20576F726C64",
              "byteLength": 13
            },
            "parseStatus": "unsupported"
          }
        ]
      }
    },
    "signatureAlgorithm": {
      "algorithm": {
        "oid": "1.2.840.113549.1.1.11",
        "name": "sha256WithRSAEncryption"
      }
    },
    "signatureValue": {
      "hex": "...",
      "bitLength": 2048,
      "unusedBits": 0
    }
  },
  "meta": { "timestamp": "2026-02-04T12:00:00Z" },
  "error": null
}
```

---

### 2. Certificate Revocation Lists (CRLs)

#### List CRLs

```
GET /api/v2/crls
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `cursor` | string | - | Pagination cursor |
| `limit` | number | 50 | Items per page (1-100) |
| `type` | string | - | Filter: `full`, `delta` |

**Notes:**

- Results are returned in storage key order. Explicit sorting is not currently supported.

**Response:**

Each CRL is returned as a single item, representing the canonical DER-encoded format. Both DER and PEM representations are available for download:

- **DER format**: Use the `downloadUrl` directly
- **PEM format**: Append `.pem` to the base filename (e.g., `/crl/filename.crl.pem`)

```typescript
interface CrlListItem {
  id: string; // Canonical identifier (e.g., "crl/root-ca.crl" or "dcrl/issuing-ca.crl")
  type: "crl";
  href: string; // Link to detail endpoint
  downloadUrl: string; // Download link (DER format)

  storage: {
    filename: string; // Base filename without extension
    format: "der"; // Always DER (canonical format)
    size: number; // Size of DER-encoded file
    uploadedAt: string; // ISO 8601 timestamp
  };

  summary: {
    crlType: "full" | "delta";
    issuerCommonName: string | null;
    crlNumber: string | null;
    baseCrlNumber: string | null;
    thisUpdate: string | null;
    nextUpdate: string | null;
    revokedCount: number;
  };

  fingerprints: {
    sha1: string;
    sha256: string;
  };
}
```

**Format Availability:**

For each CRL returned, both representations are available:

| Format | URL Pattern                  |
| ------ | ---------------------------- |
| DER    | `/{id}` (from `downloadUrl`) |
| PEM    | `/{id}.pem`                  |

Example:

- DER: `/crl/root-ca.crl`
- PEM: `/crl/root-ca.crl.pem`

---

#### Get CRL Details

```
GET /api/v2/crls/{id}
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | CRL identifier (filename) |

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `include` | string | - | Comma-separated optional sections |
| `revocations.limit` | number | 10 | Max revocation entries |
| `revocations.cursor` | number | 0 | Pagination offset (0-based) |

**Include Options:**

- `extensions` - CRL extensions
- `revokedCertificates` - List of revoked certs
- `signatureAlgorithm` - Signature algorithm
- `signatureValue` - Signature bytes

**Notes:**

- `tbsCertList` is always included.
- If `include` is omitted, the response includes extensions, signature fields, and revoked certificates by default.
- If `include` is provided, only the listed optional sections are included.
- Status and expiry timing are computed client-side from `tbsCertList.thisUpdate` and `tbsCertList.nextUpdate`.

**Response Structure (X.509 CRL Aligned):**

Follows the CRL ASN.1 structure (RFC 5280 §5):

```
CertificateList ::= SEQUENCE {
    tbsCertList          TBSCertList,
    signatureAlgorithm   AlgorithmIdentifier,
    signatureValue       BIT STRING
}
```

```typescript
interface CrlDetail {
  // === Resource Metadata ===
  id: string; // Canonical DER identifier (e.g., "crl/root-ca.crl" or "dcrl/issuing-ca.crl")
  type: "crl";
  href: string; // Link to this resource (always points to canonical DER version)
  downloadUrl: string; // Download link (always DER format, append .pem for PEM)

  // === Storage Metadata ===
  storage: {
    filename: string; // Base filename without extension
    format: "der"; // Always canonical DER format (API design principle #9)
    size: number; // Size of DER-encoded CRL
    uploadedAt: string;
    etag: string;
  };

  // === Computed Fields ===
  fingerprints: {
    sha1: string;
    sha256: string;
  };

  // Derived classification
  crlType: "full" | "delta";

  // === X.509 TBSCertList (RFC 5280 §5.1.2) ===
  tbsCertList: {
    version?: X509Version; // Optional, v2 if extensions present
    signature: AlgorithmIdentifier;
    issuer: Name;
    thisUpdate: Time;
    nextUpdate?: Time;

    // Revoked certificates list
    revokedCertificates?: RevokedCertificates;

    // CRL Extensions (v2)
    crlExtensions?: CrlExtensions;
  };

  // === Outer Signature ===
  signatureAlgorithm?: AlgorithmIdentifier;
  signatureValue?: BitString;

  // === Relationships ===
  relationships: {
    issuer?: RelationshipLink;
    baseCrl?: RelationshipLink; // For delta CRLs
    deltaCrls?: RelationshipLink[];
  };
}

// === Revoked Certificates (RFC 5280 §5.1.2.6) ===
interface RevokedCertificates {
  count: number;

  // Paginated list
  items: RevokedCertificate[];
  hasMore: boolean;
  nextCursor?: string;
}

interface RevokedCertificate {
  userCertificate: SerialNumber;
  revocationDate: Time;

  // CRL Entry Extensions (optional)
  crlEntryExtensions?: CrlEntryExtensions;
}

interface CrlEntryExtensions {
  count: number;
  items: CrlEntryExtension[];
}

interface CrlEntryExtension {
  extnID: ObjectIdentifier;
  critical: boolean;
  extnValue: { hex: string; byteLength: number };
  parseStatus: "parsed" | "unsupported" | "error";
  parseError?: string;
  parsed?: CrlEntryExtensionValue;
}

type CrlEntryExtensionValue =
  | CRLReasonValue
  | InvalidityDateValue
  | CertificateIssuerValue
  | UnknownExtensionValue;

interface CRLReasonValue {
  extensionType: "cRLReason";
  code: number;
  name: string; // e.g., "keyCompromise", "cessationOfOperation"
}

interface InvalidityDateValue {
  extensionType: "invalidityDate";
  date: Time;
}

interface CertificateIssuerValue {
  extensionType: "certificateIssuer";
  names: GeneralName[];
}

// === CRL Extensions (RFC 5280 §5.2) ===
interface CrlExtensions {
  count: number;
  critical: number;
  items: CrlExtension[];
}

interface CrlExtension {
  extnID: ObjectIdentifier;
  critical: boolean;
  extnValue: { hex: string; byteLength: number };
  parseStatus: "parsed" | "unsupported" | "error";
  parseError?: string;
  parsed?: CrlExtensionValue;
}

type CrlExtensionValue =
  | AuthorityKeyIdentifierValue
  | IssuerAltNameValue
  | CRLNumberValue
  | DeltaCRLIndicatorValue
  | IssuingDistributionPointValue
  | FreshestCRLValue
  | UnknownExtensionValue;

interface CRLNumberValue {
  extensionType: "cRLNumber";
  number: string; // Decimal string for large numbers
}

interface DeltaCRLIndicatorValue {
  extensionType: "deltaCRLIndicator";
  baseCRLNumber: string;
}

interface IssuerAltNameValue {
  extensionType: "issuerAltName";
  names: GeneralName[];
}

interface IssuingDistributionPointValue {
  extensionType: "issuingDistributionPoint";
  distributionPoint?: {
    fullName?: GeneralName[];
    nameRelativeToCRLIssuer?: RelativeDistinguishedName;
  };
  onlyContainsUserCerts?: boolean;
  onlyContainsCACerts?: boolean;
  onlySomeReasons?: string[];
  indirectCRL?: boolean;
  onlyContainsAttributeCerts?: boolean;
}

interface FreshestCRLValue {
  extensionType: "freshestCRL";
  distributionPoints: DistributionPoint[];
}
```

**Example Response:**

```json
{
  "data": {
    "id": "intermediate-ca.crl",
    "type": "crl",
    "href": "/api/v2/crls/intermediate-ca.crl",
    "downloadUrl": "/crl/intermediate-ca.crl",
    "storage": {
      "filename": "intermediate-ca.crl",
      "format": "der",
      "size": 4096,
      "uploadedAt": "2026-02-01T00:00:00Z",
      "etag": "def456"
    },
    "fingerprints": {
      "sha1": "...",
      "sha256": "..."
    },
    "crlType": "full",
    "tbsCertList": {
      "version": { "raw": 1, "display": "v2" },
      "signature": {
        "algorithm": {
          "oid": "1.2.840.113549.1.1.11",
          "name": "sha256WithRSAEncryption"
        }
      },
      "issuer": {
        "commonName": "Intermediate CA",
        "organization": "Example Corp",
        "rdnSequence": [
          /* ... */
        ]
      },
      "thisUpdate": {
        "iso": "2026-02-01T00:00:00Z",
        "type": "utcTime",
        "raw": "260201000000Z"
      },
      "nextUpdate": {
        "iso": "2026-02-08T00:00:00Z",
        "type": "utcTime",
        "raw": "260208000000Z"
      },
      "revokedCertificates": {
        "count": 42,
        "items": [
          {
            "userCertificate": { "hex": "0A1B2C3D", "decimal": "170926141" },
            "revocationDate": {
              "iso": "2025-06-15T12:00:00Z",
              "type": "utcTime",
              "raw": "250615120000Z"
            },
            "crlEntryExtensions": {
              "count": 1,
              "items": [
                {
                  "extnID": { "oid": "2.5.29.21", "name": "cRLReason" },
                  "critical": false,
                  "extnValue": { "hex": "0A0101", "byteLength": 3 },
                  "parseStatus": "parsed",
                  "parsed": {
                    "extensionType": "cRLReason",
                    "code": 1,
                    "name": "keyCompromise"
                  }
                }
              ]
            }
          }
        ],
        "hasMore": true,
        "nextCursor": "eyJpIjoxMH0="
      },
      "crlExtensions": {
        "count": 3,
        "critical": 0,
        "items": [
          {
            "extnID": { "oid": "2.5.29.35", "name": "authorityKeyIdentifier" },
            "critical": false,
            "extnValue": { "hex": "...", "byteLength": 24 },
            "parseStatus": "parsed",
            "parsed": {
              "extensionType": "authorityKeyIdentifier",
              "keyIdentifier": "A1B2C3D4E5F6..."
            }
          },
          {
            "extnID": { "oid": "2.5.29.20", "name": "cRLNumber" },
            "critical": false,
            "extnValue": { "hex": "02022A", "byteLength": 3 },
            "parseStatus": "parsed",
            "parsed": {
              "extensionType": "cRLNumber",
              "number": "42"
            }
          }
        ]
      }
    }
  },
  "meta": { "timestamp": "2026-02-04T12:00:00Z" },
  "error": null
}
```

---

#### Upload CRL

```
POST /api/v2/crls
```

**Request Headers:**
| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes | `text/plain` for PEM, `application/pkix-crl` for DER |

**Request Body:**

- PEM-encoded CRL text, or
- DER-encoded CRL binary

**Response (201 Created):**

```typescript
interface CrlUploadResponse {
  id: string;
  type: "crl";
  href: string;
  downloadUrl: string;

  attributes: {
    crlType: "full" | "delta";
    crlNumber: string | null;
    baseCrlNumber: string | null;
    thisUpdate: string;
    nextUpdate: string | null;

    issuer: {
      cn: string | null;
      keyId: string | null;
    };

    stored: {
      der: string; // Path to DER file
      pem: string; // Path to PEM file
      byKeyId?: string; // Path to AKI-indexed copy
    };

    replaced?: {
      id: string;
      crlNumber: string | null;
      archivedTo: string;
    };
  };
}
```

**Error Responses:**
| Status | Code | Description |
|--------|------|-------------|
| 400 | `invalid_content_type` | Unsupported Content-Type |
| 400 | `invalid_pem` | Malformed PEM block |
| 400 | `invalid_der` | Malformed ASN.1/DER data |
| 400 | `issuer_not_found` | No matching CA certificate |
| 400 | `invalid_signature` | CRL signature verification failed |
| 409 | `stale_crl` | CRL is older than existing version |

---

### 3. Revocation Lookup

**Status:** Not implemented in the current worker. The endpoints below are reserved for future work.

#### Check Certificate Revocation Status

```
GET /api/v2/crls/{crlId}/revocations/{serialNumber}
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `crlId` | string | CRL identifier |
| `serialNumber` | string | Certificate serial number (hex) |

**Response (200 OK - Found):**

```json
{
  "data": {
    "id": "0A1B2C3D",
    "type": "revocation",
    "attributes": {
      "serialNumber": "0A1B2C3D",
      "revocationDate": "2025-06-15T12:00:00Z",
      "reason": "keyCompromise",
      "reasonCode": 1,
      "invalidityDate": "2025-06-14T00:00:00Z"
    }
  },
  "meta": { ... },
  "error": null
}
```

**Response (404 Not Found - Not Revoked):**

```json
{
  "data": null,
  "meta": { ... },
  "error": {
    "code": "not_found",
    "message": "Certificate serial number not found in this CRL"
  }
}
```

---

#### Bulk Revocation Check

```
POST /api/v2/crls/{crlId}/revocations/lookup
```

**Request Body:**

```json
{
  "serialNumbers": ["0A1B2C3D", "0E5F6A7B", "0C3D4E5F"]
}
```

**Response:**

```json
{
  "data": {
    "results": [
      {
        "serialNumber": "0A1B2C3D",
        "revoked": true,
        "entry": {
          "revocationDate": "2025-06-15T12:00:00Z",
          "reason": "keyCompromise"
        }
      },
      {
        "serialNumber": "0E5F6A7B",
        "revoked": false,
        "entry": null
      },
      {
        "serialNumber": "0C3D4E5F",
        "revoked": true,
        "entry": {
          "revocationDate": "2025-08-01T00:00:00Z",
          "reason": "cessationOfOperation"
        }
      }
    ],
    "crlInfo": {
      "id": "intermediate-ca.crl",
      "crlNumber": "42",
      "thisUpdate": "2026-02-01T00:00:00Z"
    }
  },
  "meta": { ... },
  "error": null
}
```

---

### 4. Search and Discovery

#### Global Search

```
GET /api/v2/search
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query |
| `type` | string | Filter by type: `certificate`, `crl` |
| `limit` | number | Max results per type |

**Response:**

```json
{
  "data": {
    "certificates": [ ... ],
    "crls": [ ... ]
  },
  "meta": {
    "query": "Example CA",
    "counts": {
      "certificates": 3,
      "crls": 2
    }
  },
  "error": null
}
```

---

### 5. Statistics and Health

#### Get Statistics

```
GET /api/v2/stats
```

**Response:**

```json
{
  "data": {
    "certificates": {
      "total": 5
    },
    "crls": {
      "total": 8,
      "full": 4,
      "delta": 4,
      "totalRevocations": 156
    },
    "storage": {
      "totalSize": 245760,
      "byPrefix": {
        "ca": 45056,
        "crl": 102400,
        "dcrl": 98304
      }
    }
  },
  "meta": {
    "timestamp": "2026-02-04T12:00:00Z"
  },
  "error": null
}
```

---

#### Health Check

```
GET /api/v2/health
```

**Response:**

```json
{
  "data": {
    "status": "healthy",
    "version": "2.0.0",
    "checks": {
      "storage": {
        "status": "ok",
        "latencyMs": 12
      },
      "cache": {
        "status": "ok"
      }
    }
  },
  "meta": {
    "timestamp": "2026-02-04T12:00:00Z"
  },
  "error": null
}
```

---

## Binary Download Endpoints

These endpoints remain at the root level for use in PKI AIA/CDP URLs:

| Method    | Path               | Description             |
| --------- | ------------------ | ----------------------- |
| GET, HEAD | `/ca/{filename}`   | Download CA certificate |
| GET, HEAD | `/crl/{filename}`  | Download full CRL       |
| GET, HEAD | `/dcrl/{filename}` | Download delta CRL      |

**Response Headers:**
| Header | Value |
|--------|-------|
| `Content-Type` | `application/pkix-cert`, `application/pkix-crl`, or `application/x-pem-file` |
| `Content-Disposition` | `attachment; filename="..."` |
| `Cache-Control` | Appropriate caching headers |
| `ETag` | Entity tag for conditional requests |
| `Last-Modified` | Upload timestamp |
| `X-PKI-Object-Type` | `certificate` or `crl` |
| `X-PKI-Subject-CN` | Subject CN (certificates) |
| `X-PKI-Issuer-CN` | Issuer CN |

---

## Error Codes Reference

| Code                     | HTTP Status | Description                         |
| ------------------------ | ----------- | ----------------------------------- |
| `bad_request`            | 400         | Malformed request                   |
| `invalid_content_type`   | 400         | Unsupported Content-Type            |
| `invalid_pem`            | 400         | Malformed PEM block                 |
| `invalid_der`            | 400         | Malformed DER/ASN.1                 |
| `invalid_path`           | 400         | Invalid URL path format             |
| `invalid_parameter`      | 400         | Invalid query parameter             |
| `validation_error`       | 400         | Request validation failed           |
| `issuer_not_found`       | 400         | CRL issuer certificate not found    |
| `invalid_signature`      | 400         | Cryptographic signature invalid     |
| `unauthorized`           | 401         | Authentication required             |
| `forbidden`              | 403         | Insufficient permissions            |
| `not_found`              | 404         | Resource not found                  |
| `method_not_allowed`     | 405         | HTTP method not supported           |
| `conflict`               | 409         | Resource conflict (e.g., stale CRL) |
| `stale_crl`              | 409         | Uploaded CRL is older than existing |
| `unsupported_media_type` | 415         | Content-Type not supported          |
| `rate_limited`           | 429         | Too many requests                   |
| `internal_error`         | 500         | Internal server error               |
| `storage_error`          | 500         | R2 storage error                    |

---

## TypeScript Type Definitions

The complete type definitions for the API. These types align with X.509/RFC 5280 structures while providing both raw and parsed representations.

```typescript
// =============================================================================
// API Response Envelope
// =============================================================================

interface ApiResponse<T> {
  data: T | null;
  meta: ResponseMeta | null;
  error: ApiError | null;
}

interface ResponseMeta {
  requestId?: string;
  timestamp: string;
  cached?: boolean;
  cacheAge?: number;
  links?: Record<string, string>;
  pagination?: PaginationMeta;
}

interface PaginationMeta {
  cursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
  pageSize: number;
  totalCount?: number;
}

interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  field?: string;
}

// =============================================================================
// X.509 Primitive Types (RFC 5280 aligned)
// =============================================================================

/** X.509 version number */
interface X509Version {
  raw: number; // 0=v1, 1=v2, 2=v3
  display: "v1" | "v2" | "v3";
}

/** Certificate/CRL serial number */
interface SerialNumber {
  hex: string; // Raw hex bytes (uppercase)
  decimal?: string; // Decimal string if not too large
}

/** ASN.1 BIT STRING */
interface BitString {
  hex: string;
  bitLength: number;
  unusedBits: number;
}

/** ASN.1 OBJECT IDENTIFIER with optional name resolution */
interface ObjectIdentifier {
  oid: string; // Dotted decimal: "1.2.840.113549.1.1.11"
  name: string | null; // Resolved name or null if unknown
}

/** AlgorithmIdentifier (RFC 5280 §4.1.1.2) */
interface AlgorithmIdentifier {
  algorithm: ObjectIdentifier;
  parameters?: {
    parsed?: unknown; // Algorithm-specific parsed value
    rawHex: string; // Always include raw
  };
}

/** Time value with original encoding info */
interface Time {
  iso: string; // ISO 8601 normalized
  type: "utcTime" | "generalizedTime";
  raw: string; // Original encoded string
}

// =============================================================================
// Distinguished Name (RFC 5280 §4.1.2.4)
// =============================================================================

/** Full Name structure preserving RDN order */
interface Name {
  // Normalized fields for easy access
  commonName: string | null;
  organization: string | null;
  organizationalUnit: string | null;
  country: string | null;
  stateOrProvince: string | null;
  locality: string | null;

  // Full RDN sequence (preserves order and multi-value RDNs)
  rdnSequence: RelativeDistinguishedName[];
}

interface RelativeDistinguishedName {
  attributes: AttributeTypeAndValue[];
}

interface AttributeTypeAndValue {
  type: ObjectIdentifier;
  value: AttributeValue;
}

interface AttributeValue {
  string: string | null; // Decoded string value
  encoding:
    | "utf8String"
    | "printableString"
    | "ia5String"
    | "bmpString"
    | "universalString"
    | "unknown";
  rawHex?: string; // Raw for non-string values
}

// =============================================================================
// Public Key Types (RFC 5280 §4.1.2.7)
// =============================================================================

interface SubjectPublicKeyInfo {
  algorithm: AlgorithmIdentifier;
  subjectPublicKey: BitString;
  parsed?: RSAPublicKey | ECPublicKey | EdPublicKey | UnknownPublicKey;
  fingerprints: {
    sha1: string;
    sha256: string;
  };
}

interface RSAPublicKey {
  type: "rsa";
  modulus: { hex: string; bitLength: number };
  publicExponent: number;
}

interface ECPublicKey {
  type: "ec";
  curve: ObjectIdentifier;
  point: { hex: string; x?: string; y?: string };
  keySize: number;
}

interface EdPublicKey {
  type: "ed25519" | "ed448";
  publicKey: { hex: string };
}

interface UnknownPublicKey {
  type: "unknown";
}

// =============================================================================
// Extensions (RFC 5280 §4.2)
// =============================================================================

interface Extensions {
  count: number;
  critical: number;
  items: Extension[];
}

interface Extension {
  extnID: ObjectIdentifier;
  critical: boolean;
  extnValue: { hex: string; byteLength: number };
  parseStatus: "parsed" | "unsupported" | "error";
  parseError?: string;
  parsed?: ParsedExtensionValue;
}

// Union of all known extension value types
type ParsedExtensionValue =
  | BasicConstraintsValue
  | KeyUsageValue
  | ExtendedKeyUsageValue
  | SubjectAltNameValue
  | AuthorityKeyIdentifierValue
  | SubjectKeyIdentifierValue
  | CRLDistributionPointsValue
  | AuthorityInfoAccessValue
  | CertificatePoliciesValue
  | NameConstraintsValue
  | CRLNumberValue
  | DeltaCRLIndicatorValue
  | IssuingDistributionPointValue
  | CRLReasonValue
  | InvalidityDateValue
  | UnknownExtensionValue;

interface BasicConstraintsValue {
  extensionType: "basicConstraints";
  cA: boolean;
  pathLenConstraint?: number;
}

interface KeyUsageValue {
  extensionType: "keyUsage";
  digitalSignature: boolean;
  nonRepudiation: boolean;
  keyEncipherment: boolean;
  dataEncipherment: boolean;
  keyAgreement: boolean;
  keyCertSign: boolean;
  cRLSign: boolean;
  encipherOnly: boolean;
  decipherOnly: boolean;
  usages: string[]; // Active usages for display
}

interface ExtendedKeyUsageValue {
  extensionType: "extendedKeyUsage";
  purposes: ObjectIdentifier[];
}

interface SubjectAltNameValue {
  extensionType: "subjectAltName";
  names: GeneralName[];
}

interface GeneralName {
  type:
    | "otherName"
    | "rfc822Name"
    | "dNSName"
    | "x400Address"
    | "directoryName"
    | "ediPartyName"
    | "uniformResourceIdentifier"
    | "iPAddress"
    | "registeredID";
  value: string;
  typeOid?: string;
  rawHex?: string;
}

interface AuthorityKeyIdentifierValue {
  extensionType: "authorityKeyIdentifier";
  keyIdentifier?: string;
  authorityCertIssuer?: GeneralName[];
  authorityCertSerialNumber?: string;
}

interface SubjectKeyIdentifierValue {
  extensionType: "subjectKeyIdentifier";
  keyIdentifier: string;
}

interface CRLDistributionPointsValue {
  extensionType: "cRLDistributionPoints";
  distributionPoints: DistributionPoint[];
}

interface DistributionPoint {
  distributionPoint?: {
    fullName?: GeneralName[];
    nameRelativeToCRLIssuer?: RelativeDistinguishedName;
  };
  reasons?: string[];
  cRLIssuer?: GeneralName[];
}

interface AuthorityInfoAccessValue {
  extensionType: "authorityInfoAccess";
  accessDescriptions: AccessDescription[];
}

interface AccessDescription {
  accessMethod: ObjectIdentifier;
  accessLocation: GeneralName;
}

interface CertificatePoliciesValue {
  extensionType: "certificatePolicies";
  policies: PolicyInformation[];
}

interface PolicyInformation {
  policyIdentifier: ObjectIdentifier;
  policyQualifiers?: PolicyQualifier[];
}

interface PolicyQualifier {
  qualifierId: ObjectIdentifier;
  qualifier?: string | unknown;
  rawHex?: string;
}

interface NameConstraintsValue {
  extensionType: "nameConstraints";
  permittedSubtrees?: GeneralSubtree[];
  excludedSubtrees?: GeneralSubtree[];
}

interface GeneralSubtree {
  base: GeneralName;
  minimum?: number;
  maximum?: number;
}

interface CRLNumberValue {
  extensionType: "cRLNumber";
  number: string;
}

interface DeltaCRLIndicatorValue {
  extensionType: "deltaCRLIndicator";
  baseCRLNumber: string;
}

interface IssuingDistributionPointValue {
  extensionType: "issuingDistributionPoint";
  distributionPoint?: {
    fullName?: GeneralName[];
    nameRelativeToCRLIssuer?: RelativeDistinguishedName;
  };
  onlyContainsUserCerts?: boolean;
  onlyContainsCACerts?: boolean;
  onlySomeReasons?: string[];
  indirectCRL?: boolean;
  onlyContainsAttributeCerts?: boolean;
}

interface CRLReasonValue {
  extensionType: "cRLReason";
  code: number;
  name: string;
}

interface InvalidityDateValue {
  extensionType: "invalidityDate";
  date: Time;
}

interface UnknownExtensionValue {
  extensionType: "unknown";
}

// =============================================================================
// Certificate Types
// =============================================================================

interface CertificateListItem {
  id: string;
  type: "certificate";
  href: string;
  downloadUrl: string;
  storage: {
    filename: string;
    format: "der" | "pem";
    size: number;
    uploadedAt: string;
  };
  summary: {
    subjectCN: string | null;
    issuerCN: string | null;
    serialNumber: string | null;
    notBefore: string | null;
    notAfter: string | null;
  };
  fingerprints: {
    sha1: string;
    sha256: string;
  };
}

interface CertificateDetail {
  id: string;
  type: "certificate";
  href: string;
  downloadUrl: string;
  storage: {
    filename: string;
    format: "der" | "pem";
    size: number;
    uploadedAt: string;
    etag: string;
  };
  fingerprints: {
    sha1: string;
    sha256: string;
  };
  tbsCertificate: {
    version: X509Version;
    serialNumber: SerialNumber;
    signature: AlgorithmIdentifier;
    issuer: Name;
    validity: {
      notBefore: Time;
      notAfter: Time;
    };
    subject: Name;
    subjectPublicKeyInfo: SubjectPublicKeyInfo;
    issuerUniqueID?: BitString;
    subjectUniqueID?: BitString;
    extensions?: Extensions;
  };
  signatureAlgorithm?: AlgorithmIdentifier;
  signatureValue?: BitString;
  relationships: {
    issuer?: RelationshipLink;
    issuedCrls?: RelationshipLink[];
  };
}

// =============================================================================
// CRL Types
// =============================================================================

interface CrlListItem {
  id: string;
  type: "crl";
  href: string;
  downloadUrl: string;
  storage: {
    filename: string;
    format: "der" | "pem";
    size: number;
    uploadedAt: string;
  };
  summary: {
    crlType: "full" | "delta";
    issuerCommonName: string | null;
    crlNumber: string | null;
    baseCrlNumber: string | null;
    thisUpdate: string | null;
    nextUpdate: string | null;
    revokedCount: number;
  };
  fingerprints: {
    sha1: string;
    sha256: string;
  };
}

interface RevokedCertificate {
  userCertificate: SerialNumber;
  revocationDate: Time;
  crlEntryExtensions?: {
    count: number;
    items: Extension[];
  };
}

interface CrlDetail {
  id: string;
  type: "crl";
  href: string;
  downloadUrl: string;
  storage: {
    filename: string;
    format: "der" | "pem";
    size: number;
    uploadedAt: string;
    etag: string;
  };
  fingerprints: {
    sha1: string;
    sha256: string;
  };
  crlType: "full" | "delta";
  tbsCertList: {
    version?: X509Version;
    signature: AlgorithmIdentifier;
    issuer: Name;
    thisUpdate: Time;
    nextUpdate?: Time;
    revokedCertificates?: {
      count: number;
      items: RevokedCertificate[];
      hasMore: boolean;
      nextCursor?: string;
    };
    crlExtensions?: Extensions;
  };
  signatureAlgorithm?: AlgorithmIdentifier;
  signatureValue?: BitString;
  relationships: {
    issuer?: RelationshipLink;
    baseCrl?: RelationshipLink;
    deltaCrls?: RelationshipLink[];
  };
}

interface CrlUploadResponse {
  id: string;
  type: "crl";
  href: string;
  downloadUrl: string;
  crlType: "full" | "delta";
  crlNumber: string | null;
  baseCrlNumber: string | null;
  thisUpdate: string;
  nextUpdate: string | null;
  issuer: {
    commonName: string | null;
    keyIdentifier: string | null;
  };
  stored: {
    der: string;
    pem: string;
    byKeyId?: string;
  };
  replaced?: {
    id: string;
    crlNumber: string | null;
    archivedTo: string;
  };
}

// =============================================================================
// Utility Types
// =============================================================================

interface RelationshipLink {
  id: string;
  type: string;
  href: string;
}

interface SearchResult {
  certificates: CertificateListItem[];
  crls: CrlListItem[];
}

interface StatsResult {
  certificates: {
    total: number;
  };
  crls: {
    total: number;
    full: number;
    delta: number;
    totalRevocations: number;
  };
  storage: {
    totalSize: number;
    byPrefix: Record<string, number>;
  };
}

interface HealthResult {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  checks: Record<string, { status: string; latencyMs?: number }>;
}

// =============================================================================
// API Client Interface (for frontend SDK)
// =============================================================================

interface ListParams {
  cursor?: string;
  limit?: number;
}

interface CertificateListParams extends ListParams {
  search?: string;
}

interface CrlListParams extends ListParams {
  type?: "full" | "delta";
}

interface PkiApiClient {
  // Certificates
  listCertificates(params?: CertificateListParams): Promise<ApiResponse<CertificateListItem[]>>;
  getCertificate(id: string, include?: string[]): Promise<ApiResponse<CertificateDetail>>;

  // CRLs
  listCrls(params?: CrlListParams): Promise<ApiResponse<CrlListItem[]>>;
  getCrl(
    id: string,
    options?: {
      include?: string[];
      revocationsLimit?: number;
      revocationsCursor?: number;
    }
  ): Promise<ApiResponse<CrlDetail>>;
  uploadCrl(data: string | ArrayBuffer, contentType: string): Promise<ApiResponse<CrlUploadResult>>;

  // Revocations
  checkRevocation(
    crlId: string,
    serialNumber: string
  ): Promise<ApiResponse<RevokedCertificate | null>>;
  bulkCheckRevocations(
    crlId: string,
    serialNumbers: string[]
  ): Promise<
    ApiResponse<{
      results: Array<{
        serialNumber: string;
        revoked: boolean;
        entry: RevokedCertificate | null;
      }>;
      crlInfo: { id: string; crlNumber: string | null; thisUpdate: string };
    }>
  >;

  // Utility
  search(query: string, type?: "certificate" | "crl"): Promise<ApiResponse<SearchResult>>;
  getStats(): Promise<ApiResponse<StatsResult>>;
  health(): Promise<ApiResponse<HealthResult>>;
}
```

---

## Caching Strategy

| Endpoint Pattern                 | Cache TTL | Cache Key Components          |
| -------------------------------- | --------- | ----------------------------- |
| `GET /api/v2/certificates`       | 60s       | prefix, cursor, limit, search |
| `GET /api/v2/certificates/{id}`  | 300s      | id, include                   |
| `GET /api/v2/crls`               | 60s       | prefix, cursor, limit, type   |
| `GET /api/v2/crls/{id}`          | 300s      | id, include                   |
| `GET /ca/*`, `/crl/*`, `/dcrl/*` | 3600s     | path                          |
| `GET /api/v2/stats`              | 60s       | -                             |
| `GET /api/v2/health`             | 10s       | -                             |

---

## Rate Limiting (Future)

| Endpoint Pattern                         | Rate Limit   |
| ---------------------------------------- | ------------ |
| `GET /*`                                 | 1000 req/min |
| `POST /api/v2/crls`                      | 10 req/min   |
| `POST /api/v2/crls/*/revocations/lookup` | 100 req/min  |

---

## Implementation Checklist

### Phase 1: Core API

- [x] Response envelope helpers
- [x] Error handling middleware
- [x] `GET /api/v2/certificates` - List certificates
- [x] `GET /api/v2/certificates/{id}` - Get certificate details
- [x] `GET /api/v2/crls` - List CRLs
- [x] `GET /api/v2/crls/{id}` - Get CRL details
- [x] `POST /api/v2/crls` - Upload CRL
- [x] Binary download endpoints (unchanged)

### Phase 2: Enhanced Features

- [ ] `GET /api/v2/search` - Global search
- [ ] `GET /api/v2/crls/{id}/revocations/{serial}` - Single revocation check
- [ ] `POST /api/v2/crls/{id}/revocations/lookup` - Bulk revocation check
- [x] `GET /api/v2/stats` - Statistics
- [x] `GET /api/v2/health` - Health check

### Phase 3: Optimization

- [ ] Edge caching with proper invalidation
- [ ] Conditional requests (ETag/If-None-Match)
- [ ] Compression (gzip/brotli)
- [ ] Rate limiting
