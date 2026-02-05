# PKI AIA/CDP Worker

Host your PKI certificates and Certificate Revocation Lists (CRLs) on Cloudflare's edge network using Workers and R2 storage.

## What This Does

- **Serves certificates and CRLs** via HTTP from R2 storage
- **Parses and displays** PKI information in a web UI
- **Provides API endpoints** for programmatic access
- **Runs on Cloudflare's edge** for global availability

Perfect for organizations that need to publish AIA (Authority Information Access) certificates and CDP (CRL Distribution Point) files.

## For Developers

Working on this project? See [DEV-README.md](DEV-README.md) for development setup and workflow.

Quick start:

```bash
npm install
cp wrangler.example.jsonc wrangler.jsonc
npm run seed:dev
npm run dev
```

## Deployment

### Option 1: Deploy via Cloudflare Dashboard (Easiest)

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

### Option 2: Deploy via Command Line

1. **Login to Cloudflare:**

   ```bash
   npx wrangler login
   ```

2. **Customize configuration:**
   - Copy `wrangler.example.jsonc` to `wrangler.jsonc`
   - Edit `bucket_name` and `SITE_NAME` if desired

3. **Deploy:**
   ```bash
   npm run deploy
   ```

### After Deployment

Upload Endpoints

| Endpoint                    | Method | Description                                          |
| --------------------------- | ------ | ---------------------------------------------------- |
| `/`                         | GET    | Web UI showing all certificates and CRLs             |
| `/ca/{filename}`            | GET    | Download certificate (DER format)                    |
| `/crl/{filename}`           | GET    | Download CRL (DER format, append .pem for PEM)       |
| `/dcrl/{filename}`          | GET    | Download Delta CRL (DER format, append .pem for PEM) |
| `/api/v2/certificates`      | GET    | List certificates (JSON)                             |
| `/api/v2/certificates/{id}` | GET    | Certificate details (JSON)                           |
| `/api/v2/crls`              | GET    | List CRLs (JSON)                                     |
| `/api/v2/crls/{id}`         | GET    | CRL details (JSON)                                   |
| `/api/v2/crls`              | POST   | Upload a CRL (PEM or DER)                            |
| `/api/v2/stats`             | GET    | Aggregate statistics                                 |
| `/api/v2/health`            | GET    | Health check                                         |

## Requirements

- **Cloudflare account** (free tier works!)
- **Node.js 18+** (for local development)
- **Git** (to fork and deploy)

## Windows AD CS Integration

If you use Windows Active Directory Certificate Services, check out `scripts/adcs-crl-uploader.ps1` for automated CRL publishing. It monitors CA events and automatically uploads new CRLs to your worker.

## License

See [LICENSE](LICENSE) for details

**Using the Windows PowerShell script:**
See `scripts/adcs-crl-uploader.ps1` for automated CRL uploads from Windows AD CS.

## API surface

- `/` – HTML index listing certificates and CRLs.
- `/ca/*`, `/crl/*`, `/dcrl/*` – binary/PEM delivery via GET/HEAD.
- `GET /api/v2/certificates` – list certificates.
- `GET /api/v2/certificates/{id}` – certificate details.
- `GET /api/v2/crls` – list CRLs.
- `GET /api/v2/crls/{id}` – CRL details.
- `POST /api/v2/crls` – upload CRL (`Content-Type: text/plain` or `application/pkix-crl`).
- `GET /api/v2/stats` – aggregated stats.
- `GET /api/v2/health` – health check.

## Requirements

- Node.js ≥ 18
- Cloudflare account with Wrangler CLI authenticated for manual deployment (`npx wrangler login`)
- R2 bucket automatically provisioned or manually created

## Windows AD CS helper

`scripts/adcs-crl-uploader.ps1` uploads new CRLs from Windows Active Directory Certificate Services. Configure `$UploadUri`, `$SourceDir`, and `$LogPath`, enable verbose CA logging (`certutil -setreg CA\LogLevel 4`), and trigger on events 68, 69, 70 plus an optional scheduled catch-up.
