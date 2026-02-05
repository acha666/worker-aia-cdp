# LLM-oriented Project Digest

## Purpose

- Cloudflare Worker that serves PKI Authority certificates and CRLs from an R2 bucket.
- Exposes JSON APIs plus a static HTML console for browsing artifacts and inspecting parsed metadata.
- Uploads of new CRLs trigger metadata refresh and cache invalidation.

## Runtime & Infrastructure

- Cloudflare Workers runtime with [`wrangler`](https://developers.cloudflare.com/workers/wrangler/) for deploys.
- Storage via an R2 bucket exposed in `Env.STORE`.
- Static assets (HTML/CSS/JS) served by the Worker through `env.ASSETS`.
- Edge caching uses the Workers Cache (`caches.default`).

## Source Layout (high value files)

| Path                   | Role                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `src/worker/worker.ts` | Request router. Dispatches API routes, proxies asset requests, and wraps error handling. |
| `src/worker/env.ts`    | Defines `Env` bindings (`STORE`, `SITE_NAME`, `ASSETS`).                                 |
| `src/worker/api/v2/`   | API v2 router + handlers for certificates, CRLs, stats, health.                          |
| `src/worker/cache/`    | Cache key factories, TTL constants, cache helpers.                                       |
| `src/worker/pki/`      | ASN.1 parsing + PKI formatting utilities (PKI.js wrappers).                              |
| `src/worker/r2/`       | R2 abstractions for listing, summaries, metadata normalization.                          |
| `src/worker/utils/`    | JSON response + content helpers.                                                         |
| `src/web/index.html`   | Vue app shell.                                                                           |
| `src/web/main.ts`      | Vue bootstrapping + Pinia.                                                               |
| `src/web/components/`  | UI components (cards, details, status, uploads).                                         |
| `src/web/stores/`      | Pinia stores for certificates + CRLs.                                                    |
| `src/web/utils/`       | Date + X.509 formatting helpers.                                                         |
| `src/contracts/`       | Shared API contracts + schemas.                                                          |

## Request Flow Cheatsheet

1. `src/worker/worker.ts` inspects method + pathname.
2. Matches against API routes:

- `GET /api/v2/certificates` & `/api/v2/certificates/{id}`
- `GET /api/v2/crls` & `/api/v2/crls/{id}`
- `POST /api/v2/crls` (upload)
- `GET /api/v2/stats` and `/api/v2/health`

3. On cacheable responses, handlers consult `getEdgeCache()` with structured cache keys (see `src/worker/cache/config.ts`).
4. For static asset paths, fall back to `env.ASSETS.fetch` (build output from `public/`).

## Metadata & Summaries

- `src/worker/r2/summary.ts` computes lightweight summaries so list endpoints can show display names and status without parsing on every request.
  - `ensureSummaryMetadata` re-fetches an R2 object, computes summary via PKI helpers, and writes derived metadata back with conditional ETags.
  - Helpers like `createCertificateSummary` and `createCrlSummary` share PEM decoding logic and reduce duplication.
- `src/worker/pki/` formats metadata payloads for UI consumption.
- Cache invalidation spans both Workers Cache and summary keys after CRL uploads.

## Front-end Notes

- Vue components live under `src/web/components/` and compose cards + detail panels for certificates and CRLs.
- Stores in `src/web/stores/` fetch list + detail payloads from `/api/v2` using the shared contracts.

## Storage Conventions

- Prefixes: `ca/`, `crl/`, `dcrl/` (mirrored by list endpoints).
- Each CRL upload updates:<br/> • logical DER (`<folder>/<logical>.crl`).<br/> • logical PEM copy.<br/> • optional AKI-indexed copy (`/by-keyid/`).<br/> • archives previous file under `/archive/` with CRL number or hash suffix.
- Custom metadata keeps summary keys (`summaryVersion`, `summaryObjectType`, etc.) for faster listing responses.

## Running & Testing

- Install deps: `npm install`.
- Dev server: `npm run dev` (Wrangler + assets), `npm run dev:frontend` for the Vite dev server.
- Unit tests: `npm test`.
  - Worker coverage exercises cache helpers (`src/worker/cache/config.ts`), R2 list caching (`src/worker/r2/listing.ts`), summary metadata workflows (`src/worker/r2/summary.ts`), and PKI format utilities (`src/worker/pki/utils/`) using the OpenSSL fixtures under `tests/fixtures/`.
- Additional regeneration and troubleshooting notes live in `tests/README.md` (covers fixture commands and expected SHA-256 fingerprints).

## Deployment Playbook

- **Manual:** authenticate Wrangler, run `npm run build`, then `wrangler deploy --remote` (append `-e dev` for the staging environment). Confirm the `STORE` binding targets the correct R2 bucket.
- **Git-based:** connect the repo under **Workers → Deployments**. Configure commands `npm install`, `npm run build`, and `npx wrangler deploy --remote`. Provide an API token with Worker + R2 write access and map environment variables (e.g. `SITE_NAME`) per environment before enabling auto deploy.

## Key Behaviours to Remember

- `initializePkijsEngine()` invoked once at startup (`src/worker/worker.ts`).
- All JSON responses shaped as `{ data, meta, error }` via `src/worker/utils/json-response.ts`.
- Cache durations (`LIST_CACHE_TTL`, etc.) centralized in `src/worker/cache/config.ts`.
- PEM parsing uses shared `extractPEMBlock` (works for both certs and CRLs) with wrapper to standardize DER conversion.
- Vue components in `src/web/components/` cover the certificate + CRL list/detail views.
