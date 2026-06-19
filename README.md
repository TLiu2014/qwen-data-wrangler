# qwen-data-wrangler

MVP for the Qwen Cloud Hackathon (Track 4: Autopilot Agent). A chat-driven UI
that generates data-transformation pipelines visualized on a read-only
React Flow canvas, with per-stage SQL execution in browser DuckDB-WASM and
an optional agent-written report.

## Layout

- `ui/` — Vite + React 19 + Tailwind v4 + shadcn-style primitives.
  - `src/flow/` — pipeline-canvas module (React Flow nodes, stage configs,
    schema serializer, result/table views).
  - `src/lib/queryEngine/` — DuckDB-WASM execution layer.
- `server/` — Express + TypeScript. Drizzle ORM against PostgreSQL
  (ApsaraDB RDS / PolarDB) in prod or local SQLite in dev. Endpoints:
  `POST /api/generate-flow` (copilot, single-shot) and `POST /api/autopilot`
  (autopilot, SSE-streamed agent loop).

## Local setup

This repo is an npm workspaces monorepo (`ui` + `server`). Install everything
from the root and use the root scripts to drive it.

```bash
cp server/.env.example server/.env   # fill in DASHSCOPE_API_KEY
npm install

# Run both dev servers (concurrently)
npm run dev
# …or individually:
npm run dev:server   # http://localhost:4000
npm run dev:ui       # http://localhost:5173 (proxies /api → :4000)
```

Other root scripts: `npm run build`, `npm run typecheck`.

## Deployment targets

- UI → Alibaba Cloud OSS (static site).
- Server → Serverless App Engine / ECS.
- DB → ApsaraDB RDS / PolarDB (standard Postgres over TCP).

## Docs

- [`docs/query-engine.md`](docs/query-engine.md) — backend execution options.
- [`docs/positioning.md`](docs/positioning.md) — why this vs. a general AI chat.
