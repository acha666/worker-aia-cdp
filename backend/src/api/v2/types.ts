/**
 * API v2 Type Definitions
 * X.509 aligned structures following RFC 5280
 */

// =============================================================================
// API Response Envelope
// =============================================================================

export interface ApiResponse<T> {
  data: T | null;
  meta: ResponseMeta | null;
  error: ApiError | null;
}

export interface ResponseMeta {
  requestId?: string;
  timestamp: string;
  cached?: boolean;
  cacheAge?: number;
  links?: Record<string, string>;
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  cursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
  pageSize: number;
  totalCount?: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  field?: string;
}

// =============================================================================
// X.509 Primitive Types (RFC 5280 aligned)
// =============================================================================

/** X.509 version number */
export interface X509Version {
  raw: number; // 0=v1, 1=v2, 2=v3
  display: "v1" | "v2" | "v3";
}

/** Certificate/CRL serial number */
export interface SerialNumber {
  hex: string; // Raw hex bytes (uppercase)
  decimal?: string; // Decimal string if not too large
}

/** ASN.1 BIT STRING */
export interface BitString {
  hex: string;
  bitLength: number;
  unusedBits: number;
}

/** ASN.1 OBJECT IDENTIFIER with optional name resolution */
export interface ObjectIdentifier {
  oid: string; // Dotted decimal: "1.2.840.113549.1.1.11"
  name: string | null; // Resolved name or null if unknown
  shortName?: string | null; // Abbreviated form
}

/** AlgorithmIdentifier (RFC 5280 §4.1.1.2) */
export interface AlgorithmIdentifier {
  algorithm: ObjectIdentifier;
  parameters?: {
    parsed?: unknown; // Algorithm-specific parsed value
    rawHex: string; // Always include raw
  };
}

/** Time value with original encoding info */
export interface Time {
  iso: string; // ISO 8601 normalized
  type: "utcTime" | "generalizedTime";
  raw: string; // Original encoded string
}

// =============================================================================
// Distinguished Name (RFC 5280 §4.1.2.4)
// =============================================================================

/** Full Name structure preserving RDN order */
export interface Name {
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

export interface RelativeDistinguishedName {
  attributes: AttributeTypeAndValue[];
}

export interface AttributeTypeAndValue {
  type: ObjectIdentifier;
  value: AttributeValue;
}

export interface AttributeValue {
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

export interface SubjectPublicKeyInfo {
  algorithm: AlgorithmIdentifier;
  subjectPublicKey: BitString;
  parsed?: RSAPublicKey | ECPublicKey | EdPublicKey | UnknownPublicKey;
  fingerprints: {
    sha1: string;
    sha256: string;
  };
}

export interface RSAPublicKey {
  type: "rsa";
  modulus: { hex: string; bitLength: number };
  publicExponent: number;
}

export interface ECPublicKey {
  type: "ec";
  curve: ObjectIdentifier;
  point: { hex: string; x?: string; y?: string };
  keySize: number;
}

export interface EdPublicKey {
  type: "ed25519" | "ed448";
  publicKey: { hex: string };
}

export interface UnknownPublicKey {
  type: "unknown";
}

// =============================================================================
// Extensions (RFC 5280 §4.2)
// =============================================================================

export interface Extensions {
  count: number;
  critical: number;
  items: Extension[];
}

export interface Extension {
  extnID: ObjectIdentifier;
  critical: boolean;
  extnValue: { hex: string; byteLength: number };
  parseStatus: "parsed" | "unsupported" | "error";
  parseError?: string;
  parsed?: ParsedExtensionValue;
}

// Union of all known extension value types
export type ParsedExtensionValue =
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
  | FreshestCRLValue
  | UnknownExtensionValue;

export interface BasicConstraintsValue {
  extensionType: "basicConstraints";
  cA: boolean;
  pathLenConstraint?: number;
}

export interface KeyUsageValue {
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

export interface ExtendedKeyUsageValue {
  extensionType: "extendedKeyUsage";
  purposes: ObjectIdentifier[];
}

export interface SubjectAltNameValue {
  extensionType: "subjectAltName";
  names: GeneralName[];
}

export interface GeneralName {
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

export interface AuthorityKeyIdentifierValue {
  extensionType: "authorityKeyIdentifier";
  keyIdentifier?: string;
  authorityCertIssuer?: GeneralName[];
  authorityCertSerialNumber?: string;
}

export interface SubjectKeyIdentifierValue {
  extensionType: "subjectKeyIdentifier";
  keyIdentifier: string;
}

export interface CRLDistributionPointsValue {
  extensionType: "cRLDistributionPoints";
  distributionPoints: DistributionPoint[];
}

export interface DistributionPoint {
  distributionPoint?: {
    fullName?: GeneralName[];
    nameRelativeToCRLIssuer?: RelativeDistinguishedName;
  };
  reasons?: string[];
  cRLIssuer?: GeneralName[];
}

export interface AuthorityInfoAccessValue {
  extensionType: "authorityInfoAccess";
  accessDescriptions: AccessDescription[];
}

export interface AccessDescription {
  accessMethod: ObjectIdentifier;
  accessLocation: GeneralName;
}

export interface CertificatePoliciesValue {
  extensionType: "certificatePolicies";
  policies: PolicyInformation[];
}

export interface PolicyInformation {
  policyIdentifier: ObjectIdentifier;
  policyQualifiers?: PolicyQualifier[];
}

export interface PolicyQualifier {
  qualifierId: ObjectIdentifier;
  qualifier?: string | unknown;
  rawHex?: string;
}

export interface NameConstraintsValue {
  extensionType: "nameConstraints";
  permittedSubtrees?: GeneralSubtree[];
  excludedSubtrees?: GeneralSubtree[];
}

export interface GeneralSubtree {
  base: GeneralName;
  minimum?: number;
  maximum?: number;
}

export interface CRLNumberValue {
  extensionType: "cRLNumber";
  number: string;
}

export interface DeltaCRLIndicatorValue {
  extensionType: "deltaCRLIndicator";
  baseCRLNumber: string;
}

export interface IssuingDistributionPointValue {
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

export interface CRLReasonValue {
  extensionType: "cRLReason";
  code: number;
  name: string;
}

export interface InvalidityDateValue {
  extensionType: "invalidityDate";
  date: Time;
}

export interface FreshestCRLValue {
  extensionType: "freshestCRL";
  distributionPoints: DistributionPoint[];
}

export interface UnknownExtensionValue {
  extensionType: "unknown";
}

// =============================================================================
// Certificate Types
// =============================================================================

export type CertificateStatusState = "valid" | "expired" | "not-yet-valid";

export interface CertificateStatus {
  state: CertificateStatusState;
  validFrom: string;
  validUntil: string;
  expiresIn?: number;
  expiredAgo?: number;
  startsIn?: number;
  expiresInHuman?: string;
}

export interface StorageInfo {
  filename: string;
  format: "der" | "pem";
  size: number;
  uploadedAt: string;
  etag?: string;
}

export interface Fingerprints {
  sha1: string;
  sha256: string;
}

export interface RelationshipLink {
  id: string;
  type: string;
  href: string;
}

export interface CertificateListItem {
  id: string;
  type: "certificate";
  href: string;
  downloadUrl: string;
  storage: Omit<StorageInfo, "etag">;
  summary: {
    subjectCN: string | null;
    issuerCN: string | null;
    serialNumber: string | null;
    notBefore: string | null;
    notAfter: string | null;
  };
  status: {
    state: CertificateStatusState;
    expiresIn?: number;
    expiredAgo?: number;
    startsIn?: number;
  };
  fingerprints: Fingerprints;
}

export interface TBSCertificate {
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
}

export interface CertificateDetail {
  id: string;
  type: "certificate";
  href: string;
  downloadUrl: string;
  storage: StorageInfo;
  fingerprints: Fingerprints;
  status: CertificateStatus;
  tbsCertificate: TBSCertificate;
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

export type CrlStatusState = "current" | "stale" | "expired";
export type CrlType = "full" | "delta";

export interface CrlStatus {
  state: CrlStatusState;
  thisUpdate: string;
  nextUpdate: string | null;
  expiresIn?: number;
  expiredAgo?: number;
  expiresInHuman?: string;
}

export interface CrlListItem {
  id: string;
  type: "crl";
  href: string;
  downloadUrl: string;
  storage: Omit<StorageInfo, "etag">;
  summary: {
    crlType: CrlType;
    issuerCommonName: string | null;
    crlNumber: string | null;
    baseCrlNumber: string | null;
    thisUpdate: string | null;
    nextUpdate: string | null;
    revokedCount: number;
  };
  status: {
    state: CrlStatusState;
    expiresIn?: number;
    expiredAgo?: number;
  };
  fingerprints: Fingerprints;
}

export interface RevokedCertificate {
  userCertificate: SerialNumber;
  revocationDate: Time;
  crlEntryExtensions?: {
    count: number;
    items: Extension[];
  };
}

export interface RevokedCertificates {
  count: number;
  items: RevokedCertificate[];
  hasMore: boolean;
  nextCursor?: string;
}

export interface TBSCertList {
  version?: X509Version;
  signature: AlgorithmIdentifier;
  issuer: Name;
  thisUpdate: Time;
  nextUpdate?: Time;
  revokedCertificates?: RevokedCertificates;
  crlExtensions?: Extensions;
}

export interface CrlDetail {
  id: string;
  type: "crl";
  href: string;
  downloadUrl: string;
  storage: StorageInfo;
  fingerprints: Fingerprints;
  status: CrlStatus;
  crlType: CrlType;
  tbsCertList: TBSCertList;
  signatureAlgorithm?: AlgorithmIdentifier;
  signatureValue?: BitString;
  relationships: {
    issuer?: RelationshipLink;
    baseCrl?: RelationshipLink;
    deltaCrls?: RelationshipLink[];
  };
}

export interface CrlUploadResult {
  id: string;
  type: "crl";
  href: string;
  downloadUrl: string;
  crlType: CrlType;
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
// Stats and Health
// =============================================================================

export interface StatsResult {
  certificates: {
    total: number;
    byStatus: Record<CertificateStatusState, number>;
  };
  crls: {
    total: number;
    full: number;
    delta: number;
    byStatus: Record<CrlStatusState, number>;
    totalRevocations: number;
  };
  storage: {
    totalSize: number;
    byPrefix: Record<string, number>;
  };
}

export interface HealthResult {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  checks: Record<string, { status: string; latencyMs?: number }>;
}

// =============================================================================
// Search
// =============================================================================

export interface SearchResult {
  certificates: CertificateListItem[];
  crls: CrlListItem[];
}
