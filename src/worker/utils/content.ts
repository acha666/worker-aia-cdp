function contentTypeByKey(key: string) {
  if (key.endsWith(".pem") || key.endsWith(".crt.pem") || key.endsWith(".crl.pem")) {
    return "text/plain; charset=utf-8";
  }
  if (key.endsWith(".crt") || key.endsWith(".cer") || key.endsWith(".der")) {
    return "application/pkix-cert";
  }
  if (key.endsWith(".crl")) {
    return "application/pkix-crl";
  }
  return "application/octet-stream";
}

function readNextUpdate(metadata?: Record<string, string>): Date | null {
  if (!metadata) {
    return null;
  }
  const raw = metadata.summaryNextUpdate ?? metadata.nextUpdate;
  if (!raw) {
    return null;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export function buildHeadersForObject(
  obj: R2ObjectBody | R2Object,
  key: string,
  metadata?: Record<string, string>
) {
  const headers = new Headers();
  headers.set("Content-Type", contentTypeByKey(key));

  const record = obj as unknown as {
    etag?: string;
    httpEtag?: string;
    uploaded?: Date;
  };
  const etag: unknown = record?.etag ?? record?.httpEtag;
  if (typeof etag === "string" && etag.length > 0) {
    headers.set("ETag", etag);
  }
  const uploaded: unknown = record?.uploaded;
  if (uploaded instanceof Date) {
    headers.set("Last-Modified", uploaded.toUTCString());
  }

  if (/(\.crt|\.cer|\.der)(\.pem)?$/i.test(key)) {
    headers.set(
      "Cache-Control",
      "public, max-age=31536000, immutable, s-maxage=31536000, stale-while-revalidate=604800"
    );
  } else if (key.endsWith(".crl") || key.endsWith(".crl.pem")) {
    const nextUpdate = readNextUpdate(metadata);
    const now = Date.now();
    const maxAge = nextUpdate ? Math.max(0, Math.floor((nextUpdate.getTime() - now) / 1000)) : 300;
    headers.set("Cache-Control", `public, max-age=${maxAge}, s-maxage=${maxAge}, must-revalidate`);
  } else {
    headers.set(
      "Cache-Control",
      "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800"
    );
  }

  return headers;
}
