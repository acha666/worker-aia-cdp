# Developer Guide

Simple guide for developing this project locally.

## Quick Start

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Copy config template**

   ```bash
   cp wrangler.example.jsonc wrangler.jsonc
   ```

   Edit `wrangler.jsonc` if you need to change the bucket name or other settings.

3. **Generate test certificates and seed R2**

   ```bash
   npm run seed:dev
   ```

   This creates test CA certificates and uploads them to your local R2 bucket.

4. **Start the development server**

   ```bash
   npm run dev
   ```

   Open http://localhost:8787 in your browser.

## Test Data

The `seed:dev` command generates:

- Root CA certificate
- Intermediate CA certificate
- Various test certificates (expired, revoked, rogue CA)
- Multiple CRLs with edge cases

Only the root and intermediate CA certificates are uploaded to R2. You can add more test files manually.

## Useful Commands

### Development

```bash
npm run dev              # Start dev server (builds assets + runs worker locally)
npm run dev:frontend     # Vite dev server only (if you need it)
npm test                 # Run tests
```

### Managing Local R2

**Add files manually:**

```bash
# Upload a certificate (use DER format)
npx wrangler r2 object put aia-cdp-local/ca/mycert.crt --file=cert.der --local --persist-to=.wrangler/state

# Upload a CRL (use PEM format)
npx wrangler r2 object put aia-cdp-local/crl/mycrl.crl --file=crl.pem --local --persist-to=.wrangler/state

# Upload a Delta CRL (use DER format)
npx wrangler r2 object put aia-cdp-local/dcrl/mydcrl.crl --file=dcrl.der --local --persist-to=.wrangler/state

# Delete an object
npx wrangler r2 object delete aia-cdp-local/ca/mycert.crt --local --persist-to=.wrangler/state
```

**Or use the API:**

```bash
curl -X POST http://localhost:8787/api/v1/crls \
     -H 'Content-Type: text/plain' \
     --data-binary @mycrl.pem
```

**Reset local R2:**

```bash
npm run reset:dev        # Automatically deletes .wrangler/state
npm run seed:dev         # Reseed with test data
```

## Project Structure

```
src/worker/            - Worker code (TypeScript)
   worker.ts            - Main entry point and routing
   api/                 - API router + handlers
   pki/                 - Certificate and CRL parsing logic
   r2/                  - R2 bucket operations
   cache/               - Cache keys and helpers
   utils/               - JSON response + content helpers

src/web/               - Browser UI (Vue)
   index.html           - Main HTML template
   main.ts              - UI entry point
   components/          - UI components
   stores/              - Pinia stores
   utils/               - Date + X.509 formatting helpers

src/contracts/         - Shared API contracts + schemas

scripts/               - Helper scripts
   generate-test-data.sh - Generate test PKI files
   seed-dev.sh          - Upload test data to R2
   reset-dev.sh         - Clear local R2 bucket

tests/                 - Tests
   fixtures/            - Generated test certificates/CRLs
   worker/              - Worker unit tests
```

## How It Works

1. **Vite** builds the frontend HTML/JS/CSS into `public/`
2. **Wrangler** runs the Worker locally and serves:
   - Static assets from `public/`
   - API endpoints from `src/worker/`
   - Binary files from R2 bucket

3. The Worker parses PKI files using `pkijs` and `asn1js`

## API Endpoints

- `GET /` - HTML UI listing certificates and CRLs
- `GET /ca/{filename}` - Download certificate (returns DER)
- `GET /crl/{filename}` - Download CRL (returns PEM)
- `GET /dcrl/{filename}` - Download Delta CRL (returns DER)
- `GET /api/v1/collections/{ca|crl|dcrl}/items` - List objects as JSON
- `GET /api/v1/objects/{key}/metadata` - Get parsed metadata for a file
- `POST /api/v1/crls` - Upload a CRL (send PEM in request body)

## Troubleshooting

**Port already in use?**

- Check if another dev server is running
- Kill it: `lsof -ti:8787 | xargs kill`

**R2 bucket not found?**

- Make sure you copied `wrangler.example.jsonc` to `wrangler.jsonc`
- Run `npm run seed:dev` to initialize

**Assets not updating?**

- Delete `public/` folder and restart: `rm -rf public && npm run dev`

**Can't parse certificate/CRL?**

- Check the file format (certificates should be DER, CRLs should be PEM for `/crl/` or DER for `/dcrl/`)
- Look at the test data in `tests/fixtures/` for examples

## Deployment

See the main [README.md](README.md) for deployment instructions.

## Need Help?

- Check existing tests in `tests/` for examples
- Look at API handlers in `src/worker/api/`
- Review PKI parsing code in `src/worker/pki/`
