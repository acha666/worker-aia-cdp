# Dev Container Configuration

This directory contains the configuration for developing the Worker AIA CDP project in a containerized environment.

## Features

- **Base Image**: Node.js 22 on Debian Bookworm
- **Pre-installed Tools**:
  - Git & GitHub CLI
  - Docker-in-Docker support
  - Standard Unix utilities

## VS Code Extensions

The following extensions are automatically installed:
- ESLint for linting
- Prettier for code formatting
- TypeScript language support
- Error Lens for inline error display
- Pretty TypeScript Errors

## Port Forwarding

- **8787**: Wrangler development server (Cloudflare Workers)
- **5173**: Vite development server (frontend assets)

## Getting Started

1. Open this project in VS Code
2. When prompted, click "Reopen in Container"
3. Wait for the container to build and dependencies to install
4. Start development with `npm run dev`

## Available Scripts

- `npm run dev` - Start both worker and asset development servers
- `npm run dev:worker` - Start Wrangler dev server only
- `npm run dev:assets` - Build and watch frontend assets
- `npm run test` - Run tests
- `npm run seed:dev` - Seed development data
- `npm run reset:dev` - Reset development environment

## SSH Key Mounting

Your host SSH keys are mounted read-only for Git operations. This allows you to push/pull from private repositories without additional configuration.
