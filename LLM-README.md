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
| `src/worker.ts` | Request router. Dispatches GET/POST routes, proxies asset requests, and wraps error handling. |
| `src/env.ts` | Defines `Env` bindings (`STORE`, `SITE_NAME`, `ASSETS`) and shared `RouteHandler` type. |
| `src/handlers/` | HTTP controllers:<br/>• `list-objects.ts` enumerates R2 keys and ensures summaries.<br/>• `get-object-metadata.ts` returns parsed metadata.<br/>• `get-binary-or-text.ts` streams DER/PEM with content headers.<br/>• `post-crl.ts` validates uploads, writes latest CRLs, archives older versions, and flushes caches. |
| `src/config/cache.ts` | Cache key factories, TTL constants, cache helpers. |
| `src/crl/` | CRL-specific helpers: issuer discovery, metadata assembly, PEM extraction. |
| `src/pki/` | ASN.1 parsing + PKI formatting utilities (PKI.js wrappers). |
| `src/r2/` | R2 abstractions for listing, summaries, metadata normalization. |
| `public/index.html` | Web console shell. |
| `public/js/main.js` | Bootstraps front-end: fetches collections, registers detail panels. |
| `public/js/components/` | UI logic. Recent refactor splits `details/` submodules (`status`, `meta`, `certificate`, `crl`, `extensions`, `view`). |
| `public/js/formatters.js` | DOM-formatting helpers shared across components. |

## Request Flow Cheatsheet
1. `src/worker.ts` inspects method + pathname.
2. Matches against API routes:<br/>   - `GET /api/v1/objects` & `/collections/{ca|crl|dcrl}/items` → `listObjects`.
   - `GET /api/v1/objects/{key}/metadata` → `getObjectMetadata`.
   - `GET|HEAD /{ca|crl|dcrl}/**` → `getBinaryOrText` (serves DER/PEM with caching headers).
   - `POST /api/v1/crls` → `createCRL` (validates, verifies signature, archives old CRLs, writes new DER/PEM copies).
3. On cacheable responses, handlers consult `getEdgeCache()` with structured cache keys (see `src/config/cache.ts`).
4. For static asset paths, fall back to `env.ASSETS.fetch` (Workers Sites / Pages build output).

## Metadata & Summaries
- `src/r2/summary.ts` computes lightweight summaries so list endpoints can show display names and status without parsing on every request.
  - `ensureSummaryMetadata` re-fetches an R2 object, computes summary via PKI helpers, and writes derived metadata back with conditional ETags.
  - Newly refactored helpers (`createCertificateSummary`, `createCrlSummary`) share PEM decoding logic and reduce duplication.
- `src/crl/metadata.ts` reads objects, parses DER (handling PEM wrappers), and constructs rich detail payloads for UI consumption.
- Cache invalidation spans both Workers Cache and bespoke summary keys after CRL uploads.

## Front-end Notes
- After refactor, `public/js/components/details/` provides focused modules:
  - `status.js` → temporal state chips and helper chips.
  - `meta.js` → renders size/ETag metrics.
  - `certificate.js` / `crl.js` → section builders tailored to object type.
  - `extensions.js` → shared extension descriptions and decoration helpers.
  - `view.js` → assembles the detail article.
- `components/list.js` renders list tiles using summaries provided by API.
- Detail panels fetch metadata lazily (`fetchMetadata`) and render via `buildDetailView`.

## Storage Conventions
- Prefixes: `ca/`, `crl/`, `dcrl/` (mirrored by list endpoints).
- Each CRL upload updates:<br/>  • logical DER (`<folder>/<logical>.crl`).<br/>  • logical PEM copy.<br/>  • optional AKI-indexed copy (`/by-keyid/`).<br/>  • archives previous file under `/archive/` with CRL number or hash suffix.
- Custom metadata keeps summary keys (`summaryVersion`, `summaryObjectType`, etc.) for faster listing responses.

## Running & Testing
- Install deps: `npm install`.
- Dev server: `npm run dev` (wrangler dev).
- Unit tests: `npm test`.
  - Backend coverage now exercises cache helpers (`src/config/cache.ts`), R2 list caching (`src/r2/listing.ts`), summary metadata workflows (`src/r2/summary.ts`), and PKI format utilities (`src/pki/format.ts`) using the OpenSSL fixtures under `tests/fixtures/`.
  - Front-end suites run against a [`linkedom`](https://github.com/WebReflection/linkedom) DOM, covering formatter utilities plus the list/status components in `public/js/components/`.
- Production deploy: `npm run deploy` (wrangler deploy).
- Additional regeneration and troubleshooting notes live in `tests/README.md` (covers fixture commands and expected SHA-256 fingerprints).

## Key Behaviours to Remember
- `initializePkijsEngine()` invoked once at startup (`src/worker.ts`).
- All JSON responses shaped as `{ data, meta, error }` via `src/http/json-response.ts`.
- Cache durations (`LIST_CACHE_TTL`, etc.) centralized in `src/config/cache.ts`.
- PEM parsing uses shared `extractPEMBlock` (works for both certs and CRLs) with new wrapper to standardize DER conversion.
- Front-end modules now lean: `details.js` simply re-exports the modular implementation, enabling tree-shaking and easier maintenance.
