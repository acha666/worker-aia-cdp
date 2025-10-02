function contentTypeByKey(key: string) {
  if (key.endsWith(".pem") || key.endsWith(".crt.pem") || key.endsWith(".crl.pem")) return "text/plain; charset=utf-8";
  if (key.endsWith(".crt")) return "application/pkix-cert";
  if (key.endsWith(".crl")) return "application/pkix-crl";
  return "application/octet-stream";
}

export function buildHeadersForObject(obj: R2ObjectBody | R2Object, key: string) {
  const headers = new Headers();
  headers.set("Content-Type", contentTypeByKey(key));

  const record = obj as any;
  const etag: unknown = record?.etag ?? record?.httpEtag;
  if (typeof etag === "string" && etag.length > 0) headers.set("ETag", etag);
  const uploaded: unknown = record?.uploaded;
  if (uploaded instanceof Date) headers.set("Last-Modified", uploaded.toUTCString());

  if (key.endsWith(".crt") || key.endsWith(".crt.pem")) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable, s-maxage=31536000, stale-while-revalidate=604800");
  } else if (key.endsWith(".crl") || key.endsWith(".crl.pem")) {
    headers.set("Cache-Control", "public, max-age=3600, must-revalidate, s-maxage=86400, stale-while-revalidate=604800");
  } else {
    headers.set("Cache-Control", "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800");
  }

  return headers;
}
