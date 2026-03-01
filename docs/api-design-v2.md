# PKI AIA/CDP Worker - API v2

## Source of truth

The API is documented from the contract and implementation:

1. Worker implementation (`src/worker/api/v2/*`, `src/worker/worker.ts`)
2. Contract and Zod schemas (`src/contracts/api.ts`, `src/contracts/schemas.ts`)
3. Generated OpenAPI (`docs/openapi-v2.json`)
4. This markdown guide

If anything conflicts, code is authoritative.

---

## OpenAPI and Redoc

- Runtime OpenAPI JSON: `GET /api/v2/openapi.json`
- Generated OpenAPI file: `docs/openapi-v2.json`
- GitHub Pages API docs landing: `/api/` (Redoc)
- GitHub Pages bundled OpenAPI: `/api/openapi.json`

Local commands:

- Generate OpenAPI: `pnpm run openapi:generate`
- Diff generated OpenAPI vs committed file: `pnpm run openapi:diff`
- Verify OpenAPI is committed: `pnpm run openapi:check`
- Lint OpenAPI: `pnpm run docs:lint`
- Build OpenAPI artifacts (generate + lint + bundle): `pnpm run docs:openapi`
- Build docs site (lint + bundle + Redoc): `pnpm run docs:build`

---

## Design principles (implemented)

1. Resource-oriented URLs (`/certificates`, `/crls`, `/stats`, `/health`)
2. Consistent response envelope (`data`, `meta`, `error`)
3. Semantic HTTP status codes
4. Cursor/limit pagination for list endpoints
5. Format deduplication (canonical DER in API metadata)

---

## Base URL

All JSON API endpoints are under:

`/api/v2`

Binary artifact URLs remain root-level for PKI use:

- `/ca/{filename}`
- `/crl/{filename}`
- `/dcrl/{filename}`

---

## Format deduplication

When both DER and PEM variants exist for a certificate or CRL:

- List/detail API responses describe the canonical DER representation.
- `storage.format` is reported as `"der"`.
- PEM remains directly downloadable by appending `.pem` to the base artifact path.

Examples:

- Certificate DER: `/ca/root-ca.crt`
- Certificate PEM: `/ca/root-ca.crt.pem`
- CRL DER: `/crl/root-ca.crl`
- CRL PEM: `/crl/root-ca.crl.pem`

---

## Response envelope

```ts
interface ApiResponse<T> {
  data: T | null;
  meta: ResponseMeta | null;
  error: ApiError | null;
}
```

Notes:

- `meta.timestamp` is always present on JSON responses.
- Lists include pagination info in `meta.pagination` and link map in `meta.links`.

---

## Implemented endpoints

| Path                        | Method | Statuses           | Notes                    |
| --------------------------- | ------ | ------------------ | ------------------------ |
| `/api/v2/openapi.json`      | GET    | 200                | OpenAPI runtime document |
| `/api/v2/health`            | GET    | 200, 503           | Health payload on both   |
| `/api/v2/certificates`      | GET    | 200                | List certificates        |
| `/api/v2/certificates/{id}` | GET    | 200, 404           | Certificate details      |
| `/api/v2/crls`              | GET    | 200                | List CRLs                |
| `/api/v2/crls/{id}`         | GET    | 200, 404           | CRL details              |
| `/api/v2/crls`              | POST   | 201, 400, 409, 415 | Upload CRL via multipart |
| `/api/v2/stats`             | GET    | 200                | Aggregated storage/stats |

---

## Endpoint details

### GET /api/v2/certificates

Query params:

- `cursor` (string)
- `limit` (number, default 50, max 100)
- `search` (string)

Behavior:

- Deduplicates DER/PEM variants to one logical item.
- Search matches subject/issuer common name metadata.

### GET /api/v2/certificates/{id}

Query params:

- `include` (comma-separated)

Supported include tokens (case-insensitive):

- `extensions`
- `signatureAlgorithm`
- `signatureValue`

Behavior:

- `tbsCertificate` is always returned.
- If `include` is omitted, optional sections are returned by default.
- If `include` is provided, optional sections are included selectively.

### GET /api/v2/crls

Query params:

- `cursor` (string)
- `limit` (number, default 50, max 100)
- `type` (`full` | `delta`)

Behavior:

- Reads root-level CRLs in `crl/` and `dcrl/`.
- Deduplicates DER/PEM variants to one logical item.

### GET /api/v2/crls/{id}

Query params:

- `include` (comma-separated)
- `revocations.limit` (number, default 10)
- `revocations.cursor` (number, default 0)

Supported include tokens (case-insensitive):

- `extensions`
- `revokedCertificates`
- `signatureAlgorithm`
- `signatureValue`

Behavior:

- If `id` has no prefix, resolution checks `crl/{id}` then `dcrl/{id}`.
- Canonical DER metadata is always returned.

### POST /api/v2/crls

Request:

- `Content-Type: multipart/form-data`
- Required file field: `crl`

Format handling:

- `.pem` filename: parsed as PEM
- `.der` / `.crl` filename: parsed as binary unless PEM delimiters are detected
- Ambiguous filenames: content-based detection

Validation and storage:

- CRL is parsed and issuer certificate must resolve.
- Signature verification is required.
- Uploaded CRL must be newer than existing logical CRL (`409 stale_crl` otherwise).

Examples:

```bash
curl -X POST -F "crl=@root-ca.crl" https://<host>/api/v2/crls
curl -X POST -F "crl=@root-ca.crl.pem" https://<host>/api/v2/crls
```

---

## Binary artifact endpoints

For PKI AIA/CDP distribution paths:

| Method    | Path               | Purpose              |
| --------- | ------------------ | -------------------- |
| GET, HEAD | `/ca/{filename}`   | Certificate download |
| GET, HEAD | `/crl/{filename}`  | Full CRL download    |
| GET, HEAD | `/dcrl/{filename}` | Delta CRL download   |

Current response behavior:

- Content-Type is derived from key extension:
  - `application/pkix-cert` for certificate DER-like files
  - `application/pkix-crl` for CRLs
  - `text/plain; charset=utf-8` for PEM files
- `Content-Disposition: attachment` is set with filename
- `ETag` and `Last-Modified` are set when available
- Cache-Control:
  - Cert binaries are long-lived immutable
  - CRLs use dynamic max-age based on `nextUpdate` when present

---

## Error codes (observed)

| Code                     | Typical Status | Meaning                                    |
| ------------------------ | -------------- | ------------------------------------------ |
| `bad_request`            | 400            | Malformed request / missing required field |
| `invalid_path`           | 400            | Path format or decoding error              |
| `invalid_parameter`      | 400            | Invalid parameter                          |
| `invalid_body`           | 400            | Request body parse/read failure            |
| `invalid_certificate`    | 400            | Certificate parse/read failure             |
| `invalid_crl`            | 400            | CRL parse/read failure                     |
| `issuer_not_found`       | 400            | No issuer certificate resolved             |
| `invalid_signature`      | 400            | CRL signature verification failed          |
| `not_found`              | 404            | Resource not found                         |
| `unsupported_media_type` | 415            | Unsupported request media type             |
| `stale_crl`              | 409            | Uploaded CRL is not newer                  |
| `internal_error`         | 500            | Unexpected server error                    |

---

## Caching summary

Current JSON API cache directives (from cache policy):

- List endpoints: short cache (`max-age=30`, `s-maxage=60`)
- Detail/meta endpoints: short cache (`max-age=30`, `s-maxage=60`)
- Binary policy helper: long immutable (`1 year`), with CRL-specific override for direct downloads

---

## Not implemented (reserved in old design)

The following were described in earlier design drafts but are not implemented in current code:

- Revocation lookup endpoints (`/api/v2/crls/{id}/revocations/*`)
- Global search endpoint (`/api/v2/search`)

---

## Validation caveat

OpenAPI currently reflects the contract and schema definitions. Route matching is contract-aware, but full contract-level runtime validation for every request field is not yet uniformly enforced by the router layer.
