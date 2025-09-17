# Acha PKI AIA/CDP Worker

A Cloudflare Worker for serving PKI certificate (AIA) and CRL (CDP) files from R2 storage, with a simple web interface and REST endpoints for upload and retrieval.

## Features
- Serves X.509 certificates and CRLs from R2 buckets
- Supports both binary (DER) and text (PEM) formats
- Dynamic index page listing available certificates and CRLs
- RESTful endpoints for uploading CRLs in PEM format
- Automatic archiving of previous CRLs

## Endpoints
- `/` or `/index.html`: Dynamic index page listing certificates and CRLs
- `/ca/*`, `/crl/*`: GET/HEAD endpoints for retrieving certificate/CRL files
- `/crl` (POST): Upload a new CRL in PEM format

## Usage
1. Configure your R2 bucket and environment variables in `wrangler.jsonc`.
2. Deploy with Wrangler:
   ```powershell
   npm install
   npm run deploy
   ```
3. Access the index page or REST endpoints as described above.

## Requirements
- Cloudflare account with R2 bucket
- Wrangler CLI

## License
MIT
