# Development

## Requirements

Node 22+ and npm 10+ are expected, along with Wrangler for local Worker development.

## Local Development

Start the Worker in local mode. This runs the Worker with the local R2 bucket configuration.

```bash
npm run dev
```

If you want a separate frontend dev server with proxying, run the frontend and the Worker in separate terminals.

```bash
npm run dev:worker
npm run dev:frontend
```

To watch only assets build output, use:

```bash
npm run dev:assets
```

## Build and Deploy

Build the frontend assets and deploy the Worker.

```bash
npm run build
npm run deploy
```

## Tests and Checks

Run tests with automatic fixture generation.

```bash
npm run test
npm run test:watch
```

Tests automatically generate PKI fixtures on demand under `tests/fixtures/pki`, which
separates certificates, CRLs, and support artifacts (keys, CSRs, serials).

Run linting and formatting checks:

```bash
npm run check
npm run check:fix
```

Run type checks individually:

```bash
npm run type-check
npm run type-check:worker
npm run type-check:web
```

Run linting and formatting individually:

```bash
npm run lint
npm run lint:fix
npm run format:check
npm run format
```

## Fixtures

Generate or clean PKI test fixtures:

```bash
npm run fixtures:generate
npm run fixtures:clean
```

Fixture layout (all generated, gitignored):

- `tests/fixtures/pki/certs/ca` CA and intermediate certificates (PEM/DER)
- `tests/fixtures/pki/certs/leaf` leaf certificates (minimal, full, revoked, short-lived)
- `tests/fixtures/pki/crls` full, delta, broken, and invalid CRL samples
- `tests/fixtures/pki/support` keys, CSRs, serial files, and CA DB state

## Local Development Data

Reset and seed the local R2 bucket:

```bash
npm run reset:dev
npm run seed:dev
```

`seed:dev` automatically generates fixtures if needed, then uploads core CA certificates
to the local R2 state.
