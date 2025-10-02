# PKI AIA/CDP Worker

Cloudflare Worker that serves PKI Authority Information Access (AIA) certificates and Certificate Revocation Lists (CDP) out of R2. Vite bundles the browser UI, Wrangler deploys the worker and assets.

## Repository map

- `backend/src/worker.ts` – Worker entry point and routing.
- `frontend/src/` – UI modules, helpers, and tests.
- `frontend/src/styles/main.css` – canonical stylesheet imported by the entry module.
- `frontend/public/` – static assets copied verbatim into the build (favicons, logos, etc.).
- `public/` – generated artefacts (HTML, JS, CSS); ignored by git and recreated by `npm run build`.
- `tests/` – backend and frontend tests executed with `tsx --test`.
- `scripts/` – optional automation helpers (e.g. Windows AD CS uploader).

## Tooling

- Vite builds the frontend entrypoints.
- Wrangler ships the worker plus generated assets.
- pkijs/asn1js handle X.509 processing inside the Worker.

## Development & QA

- `npm install`
- `npm run dev:local` — runs `vite build --mode development --watch` plus `wrangler dev` on your machine. Assets rebuild into `public/`, the Worker serves them via `env.ASSETS`.
- `npm run dev:remote` — same watch task, but the Worker executes on Cloudflare edge (`wrangler dev --remote -e dev`) against the preview bucket.
- `npm test`
- `npm run build`

## Deployment

### Production (Wrangler deploy)

1. `npx wrangler login`
2. `npm run deploy` *(runs `wrangler deploy`, which executes the configured build command for you)*

`wrangler.jsonc` seeds the production Worker with the `STORE` binding (`aia-cdp`) and `SITE_NAME` (`PKI AIA/CDP`).

### Test environment (Wrangler deploy)

- `npm run deploy:dev` or `wrangler deploy -e dev`
- Deploys to the `aia-cdp-worker-dev` script, keeps `workers_dev` enabled, and maps `STORE` to `aia-cdp` with `preview_bucket_name` `aia-cdp-dev`.
- The dev environment exposes `SITE_NAME` as `PKI AIA/CDP (Dev)`.

### Cloudflare Workers Deployments (Git)

1. In the dashboard, open **Workers → Deployments → Connect to Git** and select this repository.
2. Configure commands:
   - Install: `npm install`
   - Build *(optional)*: `npm run build` *(Wrangler will execute the configured build command during deploy; keep this step only if you want an explicit preflight build.)*
   - Deploy: `npx wrangler deploy`
3. Provide an API token (Workers + R2 write scopes) or service binding.
4. Define `SITE_NAME` and other vars per environment, and confirm the `STORE` binding targets the right bucket before enabling auto-production promotions.

## SITE_NAME propagation

- `wrangler.jsonc` sets `vars.SITE_NAME` per environment; the Worker reads it via `env.SITE_NAME`.
- During builds, Vite loads `SITE_NAME` from `.env*` files or `process.env`. `vite.config.js` falls back to the same string used in `wrangler.jsonc`.
- The plugin in `vite.config.js` replaces `%SITE_NAME%` placeholders in `frontend/src/index.html` and exposes `__SITE_NAME__` for scripts.
- When Wrangler runs the build step, pass `SITE_NAME="…"` (or provide an `.env.production`) so the generated HTML matches the target environment.

## Static assets

- Add favicons or other static files to `frontend/public/`.
- Vite copies that folder into `public/` during any build.
- Remove `public/` to force a clean rebuild; the directory is disposable.

## API surface

- `/` – HTML index listing certificates and CRLs.
- `/ca/*`, `/crl/*`, `/dcrl/*` – binary/PEM delivery via GET/HEAD.
- `GET /api/v1/collections/{ca|crl|dcrl}/items` – paginated collection listing.
- `GET /api/v1/objects/{objectKey}/metadata` – parsed metadata for an object.
- `POST /api/v1/crls` – upload CRL PEM (`Content-Type: text/plain`).

## Requirements

- Node.js ≥ 18
- Cloudflare account with Wrangler CLI authenticated (`npx wrangler login`)
- R2 bucket bound to the `STORE` binding

## Windows AD CS helper

`scripts/adcs-crl-uploader.ps1` uploads new CRLs from Windows Active Directory Certificate Services. Configure `$UploadUri`, `$SourceDir`, and `$LogPath`, enable verbose CA logging (`certutil -setreg CA\LogLevel 4`), and trigger on events 68, 69, 70 plus an optional scheduled catch-up.
