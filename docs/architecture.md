# Architecture

## Request Flow

The Worker handles three request classes. API requests under /api/v2 are routed through the contract-backed server router. Direct downloads under /ca, /crl, and /dcrl are served from R2. All other requests are served from static assets for the web UI.

Example request paths:

```text
GET /api/v2/health
GET /ca/root-ca.crt
GET /crl/root-ca.crl
```

## Storage

R2 holds certificate and CRL objects. The Worker reads the object and sets content headers for download responses. The environment binds the bucket and asset fetcher, so the same Worker can serve data and UI.

## Contracts and Clients

A shared ts-rest contract defines the API routes and response shapes. The server uses it to register handlers, and the web client uses it to make typed requests. This keeps worker and UI aligned without duplicating route definitions.

## Frontend Build

Vite builds the Vue app into the public directory. The dev server proxies API and download paths to the Wrangler dev server for local integration.
