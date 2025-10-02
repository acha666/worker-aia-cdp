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
| Path | Role |
| --- | --- |
| `backend/src/worker.ts` | Request router. Dispatches GET/POST routes, proxies asset requests, and wraps error handling. |
| `backend/src/env.ts` | Defines `Env` bindings (`STORE`, `SITE_NAME`, `ASSETS`) and shared `RouteHandler` type. |
| `backend/src/handlers/` | HTTP controllers:<br/>• `list-objects.ts` enumerates R2 keys and ensures summaries.<br/>• `get-object-metadata.ts` returns parsed metadata.<br/>• `get-binary-or-text.ts` streams DER/PEM with content headers.<br/>• `post-crl.ts` validates uploads, writes latest CRLs, archives older versions, and flushes caches. |
| `backend/src/config/cache.ts` | Cache key factories, TTL constants, cache helpers. |
| `backend/src/crl/` | CRL-specific helpers: issuer discovery, metadata assembly, PEM extraction. |
| `backend/src/pki/` | ASN.1 parsing + PKI formatting utilities (PKI.js wrappers). |
| `backend/src/r2/` | R2 abstractions for listing, summaries, metadata normalization. |
| `frontend/src/index.html` | Web console shell. |
| `frontend/src/main.js` | Bootstraps front-end: fetches collections, registers detail panels. |
| `frontend/src/components/` | UI logic. Recent refactor splits `details/` submodules (`status`, `meta`, `certificate`, `crl`, `extensions`, `view`). |
| `frontend/src/formatters.js` | DOM-formatting helpers shared across components. |

## Request Flow Cheatsheet
1. `backend/src/worker.ts` inspects method + pathname.
2. Matches against API routes:<br/>   - `GET /api/v1/objects` & `/collections/{ca|crl|dcrl}/items` → `listObjects`.
   - `GET /api/v1/objects/{key}/metadata` → `getObjectMetadata`.
   - `GET|HEAD /{ca|crl|dcrl}/**` → `getBinaryOrText` (serves DER/PEM with caching headers).
   - `POST /api/v1/crls` → `createCRL` (validates, verifies signature, archives old CRLs, writes new DER/PEM copies).
3. On cacheable responses, handlers consult `getEdgeCache()` with structured cache keys (see `backend/src/config/cache.ts`).
4. For static asset paths, fall back to `env.ASSETS.fetch` (Workers Sites / Pages build output).

## Metadata & Summaries
- `backend/src/r2/summary.ts` computes lightweight summaries so list endpoints can show display names and status without parsing on every request.
  - `ensureSummaryMetadata` re-fetches an R2 object, computes summary via PKI helpers, and writes derived metadata back with conditional ETags.
  - Newly refactored helpers (`createCertificateSummary`, `createCrlSummary`) share PEM decoding logic and reduce duplication.
- `backend/src/crl/metadata.ts` reads objects, parses DER (handling PEM wrappers), and constructs rich detail payloads for UI consumption.
- Cache invalidation spans both Workers Cache and bespoke summary keys after CRL uploads.

## Front-end Notes
- After refactor, `frontend/src/components/details/` provides focused modules:
  - `status.js` → temporal state chips and helper chips.
  - `meta.js` → renders size/ETag metrics.
  - `certificate.js` / `crl.js` → section builders tailored to object type.
  - `extensions.js` → shared extension descriptions and decoration helpers.
  - `view.js` → assembles the detail article.
- `frontend/src/components/list.js` renders list tiles using summaries provided by API.
- Detail panels fetch metadata lazily (`fetchMetadata`) and render via `buildDetailView`.

## Storage Conventions
- Prefixes: `ca/`, `crl/`, `dcrl/` (mirrored by list endpoints).
- Each CRL upload updates:<br/>  • logical DER (`<folder>/<logical>.crl`).<br/>  • logical PEM copy.<br/>  • optional AKI-indexed copy (`/by-keyid/`).<br/>  • archives previous file under `/archive/` with CRL number or hash suffix.
- Custom metadata keeps summary keys (`summaryVersion`, `summaryObjectType`, etc.) for faster listing responses.

## Running & Testing
- Install deps: `npm install`.
- Dev server: `npm run dev:local` for local Vite + Wrangler. Use `npm run dev:remote` when you need the Worker to execute against Cloudflare's edge (hits the `preview_bucket_name` for `STORE`).
- Unit tests: `npm test`.
  - Backend coverage now exercises cache helpers (`backend/src/config/cache.ts`), R2 list caching (`backend/src/r2/listing.ts`), summary metadata workflows (`backend/src/r2/summary.ts`), and PKI format utilities (`backend/src/pki/format.ts`) using the OpenSSL fixtures under `tests/fixtures/`.
  - Front-end suites run against a [`linkedom`](https://github.com/WebReflection/linkedom) DOM, covering formatter utilities plus the list/status components in `frontend/src/components/`.
- Additional regeneration and troubleshooting notes live in `tests/README.md` (covers fixture commands and expected SHA-256 fingerprints).

## Deployment Playbook
- **Manual:** authenticate Wrangler, run `npm run build`, then `wrangler deploy --remote` (append `-e dev` for the staging environment). Confirm the `STORE` binding targets the correct R2 bucket.
- **Git-based:** connect the repo under **Workers → Deployments**. Configure commands `npm install`, `npm run build`, and `npx wrangler deploy --remote`. Provide an API token with Worker + R2 write access and map environment variables (e.g. `SITE_NAME`) per environment before enabling auto deploy.

## Key Behaviours to Remember
- `initializePkijsEngine()` invoked once at startup (`backend/src/worker.ts`).
- All JSON responses shaped as `{ data, meta, error }` via `backend/src/http/json-response.ts`.
- Cache durations (`LIST_CACHE_TTL`, etc.) centralized in `backend/src/config/cache.ts`.
- PEM parsing uses shared `extractPEMBlock` (works for both certs and CRLs) with new wrapper to standardize DER conversion.
- Front-end modules now lean: `frontend/src/components/details/index.js` re-exports the modular implementation, enabling tree-shaking and easier maintenance.
