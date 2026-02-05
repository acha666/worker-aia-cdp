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

Run tests, linting, and formatting as needed.

```bash
npm run test
npm run test:watch
```

Validation commands check types, linting, and format all at once.

```bash
npm run check
npm run check:fix
```

Individual checks are also available.

```bash
npm run type-check
npm run lint
npm run lint:fix
npm run format:check
npm run format
```

## Local Data Utilities

Reset and seed scripts help populate the local R2 bucket during development.

```bash
npm run reset:dev
npm run seed:dev
```
