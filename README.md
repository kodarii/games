# Apex

Bun monorepo with React client and Hono API.

## Structure

- `apps/api` — Bun + Hono placeholder API
- `apps/client` — Vite + React + TypeScript + Tailwind + shadcn/ui

## Dev

```bash
bun install
bun run dev:api     # :3001
bun run dev:client  # :5173
```

Client proxies `/api/*` to the API in dev.
