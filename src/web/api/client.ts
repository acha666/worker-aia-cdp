/**
 * ts-rest API Client
 * Type-safe API client using the shared contract
 */

import { initClient } from "@ts-rest/core";
import { apiContract } from "@contracts/api";
import type {
  CertificateListItem,
  CertificateDetail,
  CrlListItem,
  CrlDetail,
  CrlUploadResult,
  StatsResult,
  HealthResult,
  StorageInfo,
  PaginationMeta,
} from "@contracts/schemas";

// Initialize the ts-rest client
export const api = initClient(apiContract, {
  baseUrl: "",
  baseHeaders: {
    Accept: "application/json",
  },
});

// =============================================================================
// Error Handling
// =============================================================================

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function handleApiResponse<T>(response: { status: number; body: unknown }): T {
  const body = response.body as {
    data: T | null;
    error: {
      code: string;
      message: string;
      details?: Record<string, unknown>;
    } | null;
  };

  if (body.error) {
    throw new ApiError(body.error.code, body.error.message, body.error.details);
  }

  if (body.data === null || body.data === undefined) {
    throw new ApiError("empty_response", "Empty response data", { status: response.status });
  }

  return body.data as T;
}

function handleApiResponseNullable<T>(response: { status: number; body: unknown }): T | null {
  const body = response.body as {
    data: T | null;
    error: {
      code: string;
      message: string;
      details?: Record<string, unknown>;
    } | null;
  };

  if (body.error) {
    throw new ApiError(body.error.code, body.error.message, body.error.details);
  }

  return body.data ?? null;
}

// =============================================================================
// Certificates
// =============================================================================

export interface ListCertificatesOptions {
  limit?: number;
  cursor?: string;
}

export interface ListCertificatesResult {
  items: CertificateListItem[];
  hasMore: boolean;
  nextCursor: string | null;
}

export async function listCertificates(
  options?: ListCertificatesOptions
): Promise<ListCertificatesResult> {
  const response = await api.certificates.list({
    query: {
      limit: options?.limit,
      cursor: options?.cursor,
    },
  });

  const body = response.body as {
    data: CertificateListItem[] | null;
    meta: { pagination?: PaginationMeta } | null;
    error: {
      code: string;
      message: string;
      details?: Record<string, unknown>;
    } | null;
  };

  if (body.error) {
    throw new ApiError(body.error.code, body.error.message, body.error.details);
  }

  return {
    items: body.data ?? [],
    hasMore: body.meta?.pagination?.hasMore ?? false,
    nextCursor: body.meta?.pagination?.nextCursor ?? null,
  };
}

export interface GetCertificateOptions {
  include?: ("extensions" | "signatureAlgorithm" | "signatureValue")[];
}

export async function getCertificate(
  id: string,
  options?: GetCertificateOptions
): Promise<(CertificateDetail & { storage?: StorageInfo }) | null> {
  const response = await api.certificates.get({
    params: { id },
    query: {
      include: options?.include?.join(","),
    },
  });

  return handleApiResponseNullable(response);
}

// =============================================================================
// CRLs
// =============================================================================

export interface ListCrlsOptions {
  type?: "full" | "delta" | "all";
  limit?: number;
  cursor?: string;
}

export interface ListCrlsResult {
  items: CrlListItem[];
  hasMore: boolean;
  nextCursor: string | null;
}

export async function listCrls(options?: ListCrlsOptions): Promise<ListCrlsResult> {
  const response = await api.crls.list({
    query: {
      type: options?.type === "all" ? undefined : options?.type,
      limit: options?.limit,
      cursor: options?.cursor,
    },
  });

  const body = response.body as {
    data: CrlListItem[] | null;
    meta: { pagination?: PaginationMeta } | null;
    error: {
      code: string;
      message: string;
      details?: Record<string, unknown>;
    } | null;
  };

  if (body.error) {
    throw new ApiError(body.error.code, body.error.message, body.error.details);
  }

  return {
    items: body.data ?? [],
    hasMore: body.meta?.pagination?.hasMore ?? false,
    nextCursor: body.meta?.pagination?.nextCursor ?? null,
  };
}

export interface GetCrlOptions {
  include?: ("extensions" | "signatureAlgorithm" | "signatureValue" | "revokedCertificates")[];
  revocationsLimit?: number;
  revocationsCursor?: number;
}

export async function getCrl(
  id: string,
  options?: GetCrlOptions
): Promise<(CrlDetail & { storage?: StorageInfo }) | null> {
  const response = await api.crls.get({
    params: { id },
    query: {
      include: options?.include?.join(","),
      "revocations.limit": options?.revocationsLimit,
      "revocations.cursor": options?.revocationsCursor,
    },
  });

  return handleApiResponseNullable(response);
}

export async function uploadCrl(pem: string): Promise<CrlUploadResult> {
  const response = await api.crls.upload({
    body: pem,
    extraHeaders: {
      "Content-Type": "text/plain",
    },
  });

  return handleApiResponse(response);
}

export async function uploadCrlBinary(data: ArrayBuffer): Promise<CrlUploadResult> {
  const response = await api.crls.upload({
    body: data,
    extraHeaders: {
      "Content-Type": "application/pkix-crl",
    },
  });

  return handleApiResponse(response);
}

// =============================================================================
// Stats & Health
// =============================================================================

export async function getStats(): Promise<StatsResult> {
  const response = await api.stats.get();
  return handleApiResponse(response);
}

export async function getHealth(): Promise<HealthResult> {
  const response = await api.health.get();
  return handleApiResponse(response);
}

// =============================================================================
// Re-export types from contract for convenience
// =============================================================================

export type {
  CertificateListItem,
  CertificateDetail,
  CrlListItem,
  CrlDetail,
  CrlUploadResult,
  StatsResult,
  HealthResult,
  StorageInfo,
};

// Backwards compatible type alias
export type UploadCrlResult = CrlUploadResult;
