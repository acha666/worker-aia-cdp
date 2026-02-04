const DEFAULT_JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
};

type JsonHeaders = Headers | Record<string, string> | [string, string][];

interface SuccessOptions {
  status?: number;
  meta?: Record<string, unknown> | null;
  headers?: JsonHeaders;
}

interface ErrorOptions {
  headers?: JsonHeaders;
  details?: unknown;
}

function mergeJsonHeaders(extra?: JsonHeaders) {
  const headers = new Headers(DEFAULT_JSON_HEADERS);
  if (extra) {
    const additional = new Headers(extra);
    additional.forEach((value, key) => headers.set(key, value));
  }
  return headers;
}

export function jsonSuccess<T>(data: T, options: SuccessOptions = {}) {
  const { status = 200, meta = null, headers } = options;
  const payload = { data, meta, error: null as null };
  return new Response(JSON.stringify(payload), {
    status,
    headers: mergeJsonHeaders(headers),
  });
}

export function jsonError(status: number, code: string, message: string, options: ErrorOptions = {}) {
  const { headers, details } = options;
  const errorPayload: Record<string, unknown> = { code, message };
  if (details !== undefined) {errorPayload.details = details;}
  const payload = { data: null, meta: null, error: errorPayload };
  return new Response(JSON.stringify(payload), {
    status,
    headers: mergeJsonHeaders(headers),
  });
}

export { mergeJsonHeaders };
export type { JsonHeaders, SuccessOptions, ErrorOptions };
