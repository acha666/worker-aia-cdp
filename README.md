# PKI AIA/CDP Worker

Cloudflare Worker and Vue UI for serving X.509 certificates and CRLs using AIA and CDP distribution.

## Quick start

```bash
npm install
npm run seed:dev
npm run dev
```

## Deployment

### Deploy via Cloudflare Dashboard (Easiest)

1. **Fork this repository** to your GitHub account

2. **Connect to Cloudflare:**
   - Go to Cloudflare Dashboard → **Workers & Pages** → **Create**
   - Click **Connect to Git** and select your fork
3. **Configure build:**
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
4. **Set your site name:**
   - Add environment variable `SITE_NAME` with your custom name
   - The `keep_vars: true` setting protects all vars from being reset on redeploy
5. **Deploy!**
   - R2 bucket is automatically created
   - Future git pushes will auto-deploy

### Deploy via Command Line

```bash
npx wrangler login
npm run deploy
```

## Initial Setup

Upload your CA certificates to R2 prior to uploading CRLs. The certificates stored in R2 define the whitelist of issuers whose CRLs are accepted. CRL validation checks that the issuer certificate exists in the bucket before storing a new CRL.

Use the web UI or POST to `/api/v2/crls` to upload CRL files after certificates are in place.

## Usage

### Web UI

| Path | Method | Purpose                               |
| ---- | ------ | ------------------------------------- |
| `/`  | GET    | Certificate and CRL manager interface |

### Artifact Downloads

Direct access for PKI tooling. Both DER and PEM formats are available; append `.pem` to the URL for PEM-encoded artifacts.

| Path               | Format      |
| ------------------ | ----------- |
| `/ca/{filename}`   | Certificate |
| `/crl/{filename}`  | Full CRL    |
| `/dcrl/{filename}` | Delta CRL   |

### API Endpoints

JSON endpoints for programmatic access. See full API design in [docs/api-design-v2.md](docs/api-design-v2.md).

| Path                        | Method | Purpose                 |
| --------------------------- | ------ | ----------------------- |
| `/api/v2/health`            | GET    | Service health check    |
| `/api/v2/certificates`      | GET    | List certificates       |
| `/api/v2/certificates/{id}` | GET    | Certificate details     |
| `/api/v2/crls`              | GET    | List CRLs               |
| `/api/v2/crls/{id}`         | GET    | CRL details             |
| `/api/v2/crls`              | POST   | Upload CRL (PEM or DER) |
| `/api/v2/stats`             | GET    | Service statistics      |

## Windows AD CS helper

`scripts/adcs-crl-uploader.ps1` uploads new CRLs from Windows Active Directory Certificate Services. Configure `$UploadUri`, `$SourceDir`, and `$LogPath`, enable verbose CA logging (`certutil -setreg CA\LogLevel 4`), and trigger on events 68, 69, 70 plus an optional scheduled catch-up.
