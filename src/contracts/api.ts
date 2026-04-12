/**
 * ts-rest API Contract
 * Contract-first API definition for type-safe client-server communication
 */

import { initContract } from "@ts-rest/core";
import { z } from "zod";
import {
  CertificateListItemSchema,
  CertificateDetailSchema,
  CrlListItemSchema,
  CrlDetailSchema,
  CrlUploadResultSchema,
  StatsResultSchema,
  HealthResultSchema,
  ListCertificatesQuerySchema,
  GetCertificateQuerySchema,
  ListCrlsQuerySchema,
  GetCrlQuerySchema,
  createApiResponseSchema,
} from "./schemas";

const c = initContract();

// =============================================================================
// Certificates Contract
// =============================================================================

const certificatesContract = c.router({
  list: {
    method: "GET",
    path: "/api/v2/certificates",
    query: ListCertificatesQuerySchema,
    responses: {
      200: createApiResponseSchema(z.array(CertificateListItemSchema)),
    },
    summary: "List all certificates",
    description:
      "Returns a paginated list of certificates. Results are deduplicated to canonical DER metadata when both DER and PEM variants exist.",
  },

  get: {
    method: "GET",
    path: "/api/v2/certificates/:id",
    pathParams: z.object({
      id: z.string(),
    }),
    query: GetCertificateQuerySchema,
    responses: {
      200: createApiResponseSchema(CertificateDetailSchema),
      404: createApiResponseSchema(z.null()),
    },
    summary: "Get certificate details",
    description:
      "Returns detailed information about a specific certificate including its TBS structure. Optional sections can be controlled with the include query parameter.",
  },
});

// =============================================================================
// CRLs Contract
// =============================================================================

const crlsContract = c.router({
  list: {
    method: "GET",
    path: "/api/v2/crls",
    query: ListCrlsQuerySchema,
    responses: {
      200: createApiResponseSchema(z.array(CrlListItemSchema)),
    },
    summary: "List all CRLs",
    description:
      "Returns a paginated list of CRLs. Supports filtering by type (full/delta). Results are deduplicated to canonical DER metadata when both DER and PEM variants exist.",
  },

  get: {
    method: "GET",
    path: "/api/v2/crls/:id",
    pathParams: z.object({
      id: z.string(),
    }),
    query: GetCrlQuerySchema,
    responses: {
      200: createApiResponseSchema(CrlDetailSchema),
      404: createApiResponseSchema(z.null()),
    },
    summary: "Get CRL details",
    description:
      "Returns detailed information about a specific CRL including its TBS structure and revocations. Optional sections and revocation pagination are controlled via query parameters.",
  },

  upload: {
    method: "POST",
    path: "/api/v2/crls",
    body: z.any(),
    responses: {
      201: createApiResponseSchema(CrlUploadResultSchema),
      400: createApiResponseSchema(z.null()),
      409: createApiResponseSchema(z.null()),
    },
    summary: "Upload a new CRL",
    description:
      "Upload a CRL in PEM or DER format using multipart/form-data with a required file field named crl. Authority Key Identifier is required and must match a whitelisted CA certificate Subject Key Identifier from ca/. The CRL is signature-verified and stored only if newer than the current logical CRL.",
  },
});

// =============================================================================
// Stats Contract
// =============================================================================

const statsContract = c.router({
  get: {
    method: "GET",
    path: "/api/v2/stats",
    responses: {
      200: createApiResponseSchema(StatsResultSchema),
    },
    summary: "Get statistics",
    description:
      "Returns aggregate statistics about stored certificates and CRLs including counts, CRL-type breakdown, revocation totals, and storage usage by prefix.",
  },
});

// =============================================================================
// Health Contract
// =============================================================================

const healthContract = c.router({
  get: {
    method: "GET",
    path: "/api/v2/health",
    responses: {
      200: createApiResponseSchema(HealthResultSchema),
      503: createApiResponseSchema(HealthResultSchema),
    },
    summary: "Health check",
    description:
      "Returns service health status and dependency checks. Responds with HTTP 200 when healthy and 503 when unhealthy.",
  },
});

// =============================================================================
// Main API Contract
// =============================================================================

export const apiContract = c.router(
  {
    certificates: certificatesContract,
    crls: crlsContract,
    stats: statsContract,
    health: healthContract,
  },
  {
    pathPrefix: "",
    strictStatusCodes: true,
  }
);

// Export the contract type for use in implementations
export type ApiContract = typeof apiContract;
