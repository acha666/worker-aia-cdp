# PKI AIA/CDP Worker

Cloudflare Worker that serves PKI CA certificates and revocation lists from R2. It ships with a minimal HTML index and a JSON API.

## Quick start
1. `npm install`
2. Edit `wrangler.jsonc` so `STORE` points at your R2 bucket and set `SITE_NAME` if you want a custom title.
3. Preview with `npm run dev`. Deploy with `npm run deploy`.

## API summary
- `/` – HTML index of the latest CA and CRL objects.
- `/ca/*`, `/crl/*`, `/dcrl/*` – direct GET/HEAD for DER or PEM content.
- `GET /api/v1/collections/{ca|crl|dcrl}/items` – list objects (supports `prefix`, `cursor`, `limit`).
- `GET /api/v1/objects/{objectKey}/metadata` – fetch parsed metadata for a stored object.
- `POST /api/v1/crls` – upload a CRL PEM (`Content-Type: text/plain`).

Successful uploads respond with:

```json
{
  "data": {
   "kind": "full",
   "stored": { "der": "crl/AchaRootCA.crl", "pem": "crl/AchaRootCA.crl.pem" },
   "byAki": "crl/by-keyid/<aki>.crl",
   "crlNumber": "42",
   "baseCRLNumber": null,
   "thisUpdate": "2025-09-16T00:00:00Z",
   "nextUpdate": "2025-09-23T00:00:00Z"
  },
  "meta": null,
  "error": null
}
```

## Storage layout
- `ca/` – CA certificates (`.crt`, optional `.crt.pem`)
- `crl/` – base CRLs and their `archive/` history
- `dcrl/` – delta CRLs mirroring the base layout

## Requirements
- Cloudflare account with R2 access
- Wrangler CLI authenticated to your account

## Windows AD CS automation

Run `scripts/adcs-crl-uploader.ps1` from Task Scheduler or any job runner. The script scans the CRL in folder, uploads each valid CRL or PEM file to `/api/v1/crls`, and writes plain text logs. It may rely on AD CS events or a fixed schedule to launch it.

Quick setup:
- Update `$UploadUri`, `$SourceDir`, and `$LogPath` in the script.
- Enable detailed CRL events: `certutil -setreg CA\LogLevel 4`.
- Create triggers for **Microsoft-Windows-CertificationAuthority** events **68**, **69**, and **70**, plus an optional daily catch-up run.
