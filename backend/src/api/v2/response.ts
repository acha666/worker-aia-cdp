/**
 * API v2 Response Helpers
 */

import type {
  ApiResponse,
  ResponseMeta,
  ApiError,
  PaginationMeta,
} from "./types";
import {
  withCacheStatus as cacheWithStatus,
  type CacheStatus,
} from "../../cache";

const DEFAULT_JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
};

type JsonHeaders = Headers | Record<string, string> | [string, string][];

interface SuccessOptions {
  status?: number;
  meta?: Partial<ResponseMeta>;
  headers?: JsonHeaders;
}

interface ErrorOptions {
  headers?: JsonHeaders;
  details?: unknown;
  field?: string;
}

function mergeJsonHeaders(extra?: JsonHeaders): Headers {
  const headers = new Headers(DEFAULT_JSON_HEADERS);
  if (extra) {
    const additional = new Headers(extra);
    additional.forEach((value, key) => headers.set(key, value));
  }
  return headers;
}

/**
 * Create a successful JSON response
 */
export function jsonSuccess<T>(
  data: T,
  options: SuccessOptions = {},
): Response {
  const { status = 200, meta = {}, headers } = options;

  const responseMeta: ResponseMeta = {
    timestamp: new Date().toISOString(),
    ...meta,
  };

  const payload: ApiResponse<T> = {
    data,
    meta: responseMeta,
    error: null,
  };

  return new Response(JSON.stringify(payload), {
    status,
    headers: mergeJsonHeaders(headers),
  });
}

/**
 * Create an error JSON response
 */
export function jsonError(
  status: number,
  code: string,
  message: string,
  options: ErrorOptions = {},
): Response {
  const { headers, details, field } = options;

  const error: ApiError = { code, message };
  if (details !== undefined) {
    error.details = details;
  }
  if (field !== undefined) {
    error.field = field;
  }

  const payload: ApiResponse<null> = {
    data: null,
    meta: {
      timestamp: new Date().toISOString(),
    },
    error,
  };

  return new Response(JSON.stringify(payload), {
    status,
    headers: mergeJsonHeaders(headers),
  });
}

/**
 * Create pagination metadata
 */
export function createPaginationMeta(options: {
  cursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
  pageSize: number;
  totalCount?: number;
}): PaginationMeta {
  return {
    cursor: options.cursor,
    nextCursor: options.nextCursor,
    hasMore: options.hasMore,
    pageSize: options.pageSize,
    totalCount: options.totalCount,
  };
}

/**
 * Create links for pagination
 */
export function createPaginationLinks(
  baseUrl: string,
  pathname: string,
  params: URLSearchParams,
  nextCursor: string | null,
): Record<string, string> {
  const links: Record<string, string> = {
    self: `${baseUrl}${pathname}${params.toString() ? `?${params.toString()}` : ""}`,
  };

  if (nextCursor) {
    const nextParams = new URLSearchParams(params);
    nextParams.set("cursor", nextCursor);
    links.next = `${baseUrl}${pathname}?${nextParams.toString()}`;
  }

  return links;
}

/**
 * Parse include query parameter
 */
export function parseIncludeParam(include: string | null): Set<string> {
  if (!include) {
    return new Set();
  }
  return new Set(include.split(",").map((s) => s.trim().toLowerCase()));
}

/**
 * Parse limit query parameter with bounds
 */
export function parseLimitParam(
  limitStr: string | null,
  defaultLimit = 50,
  maxLimit = 100,
): number {
  if (!limitStr) {
    return defaultLimit;
  }
  const limit = parseInt(limitStr, 10);
  if (isNaN(limit) || limit < 1) {
    return defaultLimit;
  }
  return Math.min(limit, maxLimit);
}

/**
 * Add cache status header to response
 * Re-exported from cache module for backward compatibility
 */
export function withCacheStatus(
  response: Response,
  status: CacheStatus,
): Response {
  return cacheWithStatus(response, status, "X-Cache-Status");
}

/**
 * Common error responses
 */
export const Errors = {
  notFound: (resource = "Resource") =>
    jsonError(404, "not_found", `${resource} not found`),

  badRequest: (message: string, details?: unknown) =>
    jsonError(400, "bad_request", message, { details }),

  invalidPath: (message = "Invalid URL path format") =>
    jsonError(400, "invalid_path", message),

  invalidParameter: (param: string, message: string) =>
    jsonError(400, "invalid_parameter", message, { field: param }),

  unsupportedMediaType: (received: string | null) =>
    jsonError(415, "unsupported_media_type", "Content-Type not supported", {
      details: { received },
    }),

  conflict: (code: string, message: string, details?: unknown) =>
    jsonError(409, code, message, { details }),

  internalError: (error?: unknown) =>
    jsonError(500, "internal_error", "An internal error occurred", {
      details: error instanceof Error ? error.message : String(error),
    }),
};
