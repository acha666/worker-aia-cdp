# Development

## Requirements

Node 22+ and pnpm 10+ are expected, along with Wrangler for local Worker development.

## Local Development

Start the Worker in local mode. This runs the Worker with the local R2 bucket configuration.

```bash
pnpm run dev
```

If you want a separate frontend dev server with proxying, run the frontend and the Worker in separate terminals.

```bash
pnpm run dev:worker
pnpm run dev:frontend
```

To watch only assets build output, use:

```bash
pnpm run dev:assets
```

## Build and Deploy

Build the frontend assets and deploy the Worker.

```bash
pnpm run build
pnpm run deploy
```

## Tests and Checks

Run tests with automatic fixture generation.

```bash
pnpm run test
pnpm run test:watch
```

Tests automatically generate PKI fixtures on demand under `tests/fixtures/pki`, which
separates certificates, CRLs, and support artifacts (keys, CSRs, serials).

Run linting and formatting checks:

```bash
pnpm run check
pnpm run check:fix
```

Run type checks individually:

```bash
pnpm run type-check
pnpm run type-check:worker
pnpm run type-check:web
```

Run linting and formatting individually:

```bash
pnpm run lint
pnpm run lint:fix
pnpm run format:check
pnpm run format
```

## Fixtures

Generate or clean PKI test fixtures:

```bash
pnpm run fixtures:generate
pnpm run fixtures:clean
```

Fixture layout (all generated, gitignored):

- `tests/fixtures/pki/certs/ca` CA and intermediate certificates (PEM/DER)
- `tests/fixtures/pki/certs/leaf` leaf certificates (minimal, full, revoked, short-lived)
- `tests/fixtures/pki/crls` full, delta, broken, and invalid CRL samples
- `tests/fixtures/pki/support` keys, CSRs, serial files, and CA DB state

## Local Development Data

Reset and seed the local R2 bucket:

```bash
pnpm run reset:dev
pnpm run seed:dev
```

`seed:dev` automatically generates fixtures if needed, then uploads core CA certificates
to the local R2 state.
