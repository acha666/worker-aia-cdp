/**
 * Zod schemas for API types
 * These provide runtime validation and type inference
 */

import { z } from "zod";

// =============================================================================
// X.509 Primitive Schemas
// =============================================================================

export const X509VersionSchema = z.object({
  raw: z.number(),
  display: z.enum(["v1", "v2", "v3"]),
});

export const SerialNumberSchema = z.object({
  hex: z.string(),
  decimal: z.string().optional(),
});

export const BitStringSchema = z.object({
  hex: z.string(),
  bitLength: z.number(),
  unusedBits: z.number(),
});

export const ObjectIdentifierSchema = z.object({
  oid: z.string(),
  name: z.string().nullable(),
});

export const AlgorithmIdentifierSchema = z.object({
  algorithm: ObjectIdentifierSchema,
  parameters: z
    .object({
      parsed: z.unknown().optional(),
      rawHex: z.string(),
    })
    .optional(),
});

export const TimeSchema = z.object({
  iso: z.string(),
  type: z.enum(["utcTime", "generalizedTime"]),
  raw: z.string(),
});

// =============================================================================
// Distinguished Name Schemas
// =============================================================================

export const AttributeValueSchema = z.object({
  string: z.string().nullable(),
  encoding: z.enum([
    "utf8String",
    "printableString",
    "ia5String",
    "bmpString",
    "universalString",
    "unknown",
  ]),
  rawHex: z.string().optional(),
});

export const AttributeTypeAndValueSchema = z.object({
  type: ObjectIdentifierSchema,
  value: AttributeValueSchema,
});

export const RelativeDistinguishedNameSchema = z.object({
  attributes: z.array(AttributeTypeAndValueSchema),
});

export const NameSchema = z.object({
  commonName: z.string().nullable(),
  organization: z.string().nullable(),
  organizationalUnit: z.string().nullable(),
  country: z.string().nullable(),
  stateOrProvince: z.string().nullable(),
  locality: z.string().nullable(),
  rdnSequence: z.array(RelativeDistinguishedNameSchema),
});

// =============================================================================
// Public Key Schemas
// =============================================================================

export const RSAPublicKeySchema = z.object({
  type: z.literal("rsa"),
  modulus: z.object({ hex: z.string(), bitLength: z.number() }),
  publicExponent: z.number(),
});

export const ECPublicKeySchema = z.object({
  type: z.literal("ec"),
  curve: ObjectIdentifierSchema,
  point: z.object({
    hex: z.string(),
    x: z.string().optional(),
    y: z.string().optional(),
  }),
  keySize: z.number(),
});

export const EdPublicKeySchema = z.object({
  type: z.enum(["ed25519", "ed448"]),
  publicKey: z.object({ hex: z.string() }),
});

export const UnknownPublicKeySchema = z.object({
  type: z.literal("unknown"),
});

export const PublicKeyParsedSchema = z.discriminatedUnion("type", [
  RSAPublicKeySchema,
  ECPublicKeySchema,
  EdPublicKeySchema,
  UnknownPublicKeySchema,
]);

export const FingerprintsSchema = z.object({
  sha1: z.string(),
  sha256: z.string(),
});

export const SubjectPublicKeyInfoSchema = z.object({
  algorithm: AlgorithmIdentifierSchema,
  subjectPublicKey: BitStringSchema,
  parsed: PublicKeyParsedSchema.optional(),
  fingerprints: FingerprintsSchema,
});

// =============================================================================
// General Name Schema
// =============================================================================

export const GeneralNameSchema = z.object({
  type: z.enum([
    "otherName",
    "rfc822Name",
    "dNSName",
    "x400Address",
    "directoryName",
    "ediPartyName",
    "uniformResourceIdentifier",
    "iPAddress",
    "registeredID",
  ]),
  value: z.string(),
  typeOid: z.string().optional(),
  rawHex: z.string().optional(),
});

// =============================================================================
// Extension Schemas
// =============================================================================

export const ExtensionSchema = z.object({
  extnID: ObjectIdentifierSchema,
  critical: z.boolean(),
  extnValue: z.object({ hex: z.string(), byteLength: z.number() }),
  parseStatus: z.enum(["parsed", "unsupported", "error"]),
  parseError: z.string().optional(),
  parsed: z.unknown().optional(),
});

export const ExtensionsSchema = z.object({
  count: z.number(),
  critical: z.number(),
  items: z.array(ExtensionSchema),
});

// =============================================================================
// Storage & Status Schemas
// =============================================================================

export const StorageInfoSchema = z.object({
  filename: z.string(),
  format: z.literal("der"),
  size: z.number(),
  uploadedAt: z.string(),
  etag: z.string().optional(),
});

export const CertificateStatusStateSchema = z.enum(["valid", "expired", "not-yet-valid"]);

export const CertificateStatusSchema = z.object({
  state: CertificateStatusStateSchema,
  validFrom: z.string(),
  validUntil: z.string(),
  expiresIn: z.number().optional(),
  expiredAgo: z.number().optional(),
  startsIn: z.number().optional(),
  expiresInHuman: z.string().optional(),
});

export const CrlStatusStateSchema = z.enum(["current", "stale", "expired"]);
export const CrlTypeSchema = z.enum(["full", "delta"]);

export const CrlStatusSchema = z.object({
  state: CrlStatusStateSchema,
  thisUpdate: z.string(),
  nextUpdate: z.string().nullable(),
  expiresIn: z.number().optional(),
  expiredAgo: z.number().optional(),
  expiresInHuman: z.string().optional(),
});

// =============================================================================
// Relationship Schema
// =============================================================================

export const RelationshipLinkSchema = z.object({
  id: z.string(),
  type: z.string(),
  href: z.string(),
});

// =============================================================================
// Certificate Schemas
// =============================================================================

export const CertificateListItemSchema = z.object({
  id: z.string(),
  type: z.literal("certificate"),
  href: z.string(),
  downloadUrl: z.string(),
  storage: StorageInfoSchema.omit({ etag: true }),
  summary: z.object({
    subjectCN: z.string().nullable(),
    issuerCN: z.string().nullable(),
    serialNumber: z.string().nullable(),
    notBefore: z.string().nullable(),
    notAfter: z.string().nullable(),
  }),
  status: z.object({
    state: CertificateStatusStateSchema,
    expiresIn: z.number().optional(),
    expiredAgo: z.number().optional(),
    startsIn: z.number().optional(),
  }),
  fingerprints: FingerprintsSchema,
});

export const TBSCertificateSchema = z.object({
  version: X509VersionSchema,
  serialNumber: SerialNumberSchema,
  signature: AlgorithmIdentifierSchema,
  issuer: NameSchema,
  validity: z.object({
    notBefore: TimeSchema,
    notAfter: TimeSchema,
  }),
  subject: NameSchema,
  subjectPublicKeyInfo: SubjectPublicKeyInfoSchema,
  issuerUniqueID: BitStringSchema.optional(),
  subjectUniqueID: BitStringSchema.optional(),
  extensions: ExtensionsSchema.optional(),
});

export const CertificateDetailSchema = z.object({
  id: z.string(),
  type: z.literal("certificate"),
  href: z.string(),
  downloadUrl: z.string(),
  storage: StorageInfoSchema,
  fingerprints: FingerprintsSchema,
  status: CertificateStatusSchema,
  tbsCertificate: TBSCertificateSchema,
  signatureAlgorithm: AlgorithmIdentifierSchema.optional(),
  signatureValue: BitStringSchema.optional(),
  relationships: z.object({
    issuer: RelationshipLinkSchema.optional(),
    issuedCrls: z.array(RelationshipLinkSchema).optional(),
  }),
});

// =============================================================================
// CRL Schemas
// =============================================================================

export const RevokedCertificateSchema = z.object({
  userCertificate: SerialNumberSchema,
  revocationDate: TimeSchema,
  crlEntryExtensions: z
    .object({
      count: z.number(),
      items: z.array(ExtensionSchema),
    })
    .optional(),
});

export const RevokedCertificatesSchema = z.object({
  count: z.number(),
  items: z.array(RevokedCertificateSchema),
  hasMore: z.boolean(),
  nextCursor: z.string().optional(),
});

export const TBSCertListSchema = z.object({
  version: X509VersionSchema.optional(),
  signature: AlgorithmIdentifierSchema,
  issuer: NameSchema,
  thisUpdate: TimeSchema,
  nextUpdate: TimeSchema.optional(),
  revokedCertificates: RevokedCertificatesSchema.optional(),
  crlExtensions: ExtensionsSchema.optional(),
});

export const CrlListItemSchema = z.object({
  id: z.string(),
  type: z.literal("crl"),
  href: z.string(),
  downloadUrl: z.string(),
  storage: StorageInfoSchema.omit({ etag: true }),
  summary: z.object({
    crlType: CrlTypeSchema,
    issuerCommonName: z.string().nullable(),
    crlNumber: z.string().nullable(),
    baseCrlNumber: z.string().nullable(),
    thisUpdate: z.string().nullable(),
    nextUpdate: z.string().nullable(),
    revokedCount: z.number(),
  }),
  status: z.object({
    state: CrlStatusStateSchema,
    expiresIn: z.number().optional(),
    expiredAgo: z.number().optional(),
  }),
  fingerprints: FingerprintsSchema,
});

export const CrlDetailSchema = z.object({
  id: z.string(),
  type: z.literal("crl"),
  href: z.string(),
  downloadUrl: z.string(),
  storage: StorageInfoSchema,
  fingerprints: FingerprintsSchema,
  status: CrlStatusSchema,
  crlType: CrlTypeSchema,
  tbsCertList: TBSCertListSchema,
  signatureAlgorithm: AlgorithmIdentifierSchema.optional(),
  signatureValue: BitStringSchema.optional(),
  relationships: z.object({
    issuer: RelationshipLinkSchema.optional(),
    baseCrl: RelationshipLinkSchema.optional(),
    deltaCrls: z.array(RelationshipLinkSchema).optional(),
  }),
});

export const CrlUploadResultSchema = z.object({
  id: z.string(),
  type: z.literal("crl"),
  href: z.string(),
  downloadUrl: z.string(),
  crlType: CrlTypeSchema,
  crlNumber: z.string().nullable(),
  baseCrlNumber: z.string().nullable(),
  thisUpdate: z.string(),
  nextUpdate: z.string().nullable(),
  issuer: z.object({
    commonName: z.string().nullable(),
    keyIdentifier: z.string().nullable(),
  }),
  stored: z.object({
    der: z.string(),
    pem: z.string(),
    byKeyId: z.string().optional(),
  }),
  replaced: z
    .object({
      id: z.string(),
      crlNumber: z.string().nullable(),
      archivedTo: z.string(),
    })
    .optional(),
});

// =============================================================================
// Stats and Health Schemas
// =============================================================================

export const StatsResultSchema = z.object({
  certificates: z.object({
    total: z.number(),
    byStatus: z.record(CertificateStatusStateSchema, z.number()),
  }),
  crls: z.object({
    total: z.number(),
    full: z.number(),
    delta: z.number(),
    byStatus: z.record(CrlStatusStateSchema, z.number()),
    totalRevocations: z.number(),
  }),
  storage: z.object({
    totalSize: z.number(),
    byPrefix: z.record(z.string(), z.number()),
  }),
});

export const HealthResultSchema = z.object({
  status: z.enum(["healthy", "degraded", "unhealthy"]),
  version: z.string(),
  checks: z.record(
    z.string(),
    z.object({
      status: z.string(),
      latencyMs: z.number().optional(),
    })
  ),
});

// =============================================================================
// API Response Envelope Schemas
// =============================================================================

export const PaginationMetaSchema = z.object({
  cursor: z.string().nullable(),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
  pageSize: z.number(),
  totalCount: z.number().optional(),
});

export const ResponseMetaSchema = z.object({
  requestId: z.string().optional(),
  timestamp: z.string(),
  cached: z.boolean().optional(),
  cacheAge: z.number().optional(),
  links: z.record(z.string(), z.string()).optional(),
  pagination: PaginationMetaSchema.optional(),
});

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  field: z.string().optional(),
});

export function createApiResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: dataSchema.nullable(),
    meta: ResponseMetaSchema.nullable(),
    error: ApiErrorSchema.nullable(),
  });
}

// =============================================================================
// Query Parameter Schemas
// =============================================================================

export const ListCertificatesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  status: CertificateStatusStateSchema.optional(),
  search: z.string().optional(),
});

export const GetCertificateQuerySchema = z.object({
  include: z.string().optional(),
});

export const ListCrlsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  type: CrlTypeSchema.optional(),
  status: CrlStatusStateSchema.optional(),
});

export const GetCrlQuerySchema = z.object({
  include: z.string().optional(),
  "revocations.limit": z.coerce.number().min(0).max(1000).optional(),
  "revocations.cursor": z.coerce.number().min(0).optional(),
});

// =============================================================================
// Type Inference Exports
// =============================================================================

export type X509Version = z.infer<typeof X509VersionSchema>;
export type SerialNumber = z.infer<typeof SerialNumberSchema>;
export type BitString = z.infer<typeof BitStringSchema>;
export type ObjectIdentifier = z.infer<typeof ObjectIdentifierSchema>;
export type AlgorithmIdentifier = z.infer<typeof AlgorithmIdentifierSchema>;
export type Time = z.infer<typeof TimeSchema>;
export type Name = z.infer<typeof NameSchema>;
export type Fingerprints = z.infer<typeof FingerprintsSchema>;
export type SubjectPublicKeyInfo = z.infer<typeof SubjectPublicKeyInfoSchema>;
export type Extension = z.infer<typeof ExtensionSchema>;
export type Extensions = z.infer<typeof ExtensionsSchema>;
export type StorageInfo = z.infer<typeof StorageInfoSchema>;
export type CertificateStatusState = z.infer<typeof CertificateStatusStateSchema>;
export type CertificateStatus = z.infer<typeof CertificateStatusSchema>;
export type CrlStatusState = z.infer<typeof CrlStatusStateSchema>;
export type CrlType = z.infer<typeof CrlTypeSchema>;
export type CrlStatus = z.infer<typeof CrlStatusSchema>;
export type RelationshipLink = z.infer<typeof RelationshipLinkSchema>;
export type CertificateListItem = z.infer<typeof CertificateListItemSchema>;
export type TBSCertificate = z.infer<typeof TBSCertificateSchema>;
export type CertificateDetail = z.infer<typeof CertificateDetailSchema>;
export type RevokedCertificate = z.infer<typeof RevokedCertificateSchema>;
export type TBSCertList = z.infer<typeof TBSCertListSchema>;
export type CrlListItem = z.infer<typeof CrlListItemSchema>;
export type CrlDetail = z.infer<typeof CrlDetailSchema>;
export type CrlUploadResult = z.infer<typeof CrlUploadResultSchema>;
export type StatsResult = z.infer<typeof StatsResultSchema>;
export type HealthResult = z.infer<typeof HealthResultSchema>;
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;
export type ResponseMeta = z.infer<typeof ResponseMetaSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ListCertificatesQuery = z.infer<typeof ListCertificatesQuerySchema>;
export type GetCertificateQuery = z.infer<typeof GetCertificateQuerySchema>;
export type ListCrlsQuery = z.infer<typeof ListCrlsQuerySchema>;
export type GetCrlQuery = z.infer<typeof GetCrlQuerySchema>;
