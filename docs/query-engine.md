# QueryEngine — execution backends

The agent emits a typed `PipelineSchema`. Something has to actually run that as
SQL against the user's data. We hide that "something" behind a single
[`QueryEngine`](../ui/src/lib/queryEngine/types.ts) interface so the agent
and the UI never know which backend is live:

```ts
interface QueryEngine {
  ready(): Promise<void>;
  registerCsv(name: string, csvText: string): Promise<void>;
  listTables(): Promise<RegisteredTable[]>;
  unregisterTable(name: string): Promise<void>;
  executePipeline(schema, opts?): Promise<Record<stageId, StageResult>>;
}
```

Today there is one implementation: **`BrowserDuckDBEngine`** — DuckDB-WASM
running in the user's browser tab. Everything below is tracked so that the
next person to scale this up (or the hackathon judge wondering "would it run
on Aliyun?") has the full option set in one place.

## Active

| # | Implementation | Location | Status |
|---|---|---|---|
| 1 | **Browser DuckDB-WASM** | `ui/src/lib/queryEngine/browserDuckDB.ts` | ✅ Shipped. Per-tab in-memory DB. Zero infra. CSV files load via `db.registerFileText` + `CREATE TABLE … AS read_csv_auto`. |

## Candidates (not implemented yet)

Each row is something you could write as a sibling class to `BrowserDuckDBEngine`
without changing the agent or UI. The interface stays the same; only the
constructor + `ready()` + SQL transport differ.

| # | Implementation | Best for | What it takes to wire |
|---|---|---|---|
| 2 | **DuckDB on Aliyun Function Compute** + **OSS** | Hackathon-branded server-side execution. User CSVs sit in OSS; FC reads them via DuckDB's `read_csv_auto('oss://…')` shim or a local copy. | New `ServerDuckDBEngine` posting SQL to an FC endpoint. CSV upload uploads to OSS instead of `registerFileText`. Pay-per-invocation; cold start ~1–2 s. |
| 3 | **Hologres** (Postgres-protocol MPP) | Interactive sub-second analytics on GB–TB. Reuse the existing `pg` driver in the server workspace. | New `HologresEngine` issuing the same SQL through `node-postgres`. Tables come from `CREATE EXTERNAL TABLE` over OSS or direct `COPY` from CSV. Persistent cluster cost. |
| 4 | **AnalyticDB for PostgreSQL** (ADB-PG) | Heavier OLAP; complex window functions, more SQL surface than Hologres in some areas. | Same shape as Hologres; different connection string + minor SQL dialect tweaks. |
| 5 | **MaxCompute** (ODPS) | TB+ batch workloads, scheduled jobs, not interactive (5–60 s per query). | A `MaxComputeEngine` using MaxCompute SDK. SQL dialect closer to Hive than Postgres — `pipelineToSql.ts` would need a dialect switch. |
| 6 | **DLA Serverless Presto / Lake Analytics** | Federated SQL over OSS without ingest. | Similar to FC+DuckDB but Presto dialect. Lower throughput than DuckDB at small scale; better at TB scale. |
| 7 | **Serverless Spark** | Large transforms beyond what DuckDB handles; ML-adjacent jobs. | Spark SQL dialect. Heavyweight; only worth it for jobs > tens of GB. |

## Picking between candidates

- **MVP / dev / single-user demo** → stay on #1 (current).
- **Hackathon "this runs on Aliyun" demo** → #2 is the smallest credible step
  (CSV → OSS → FC + DuckDB). Same DuckDB SQL surface as the browser, so
  `pipelineToSql.ts` doesn't change.
- **Multi-user product, interactive dashboards** → #3 (Hologres) is the
  natural fit. `node-postgres` is already a dep.
- **Big data, batch-style work** → #5 or #7.

## SQL-dialect notes

The current `pipelineToSql.ts` produces DuckDB-flavored SQL. Most of it is
standard ANSI (CREATE OR REPLACE VIEW, JOIN, GROUP BY, …), so PG-family
engines (#3, #4) accept it as-is. The exceptions:

- **`SELECT a.*, b.* EXCLUDE (col)`** — DuckDB extension. Hologres/ADB-PG
  need an explicit projection list (or `SELECT a.*, b.col2, b.col3 …`).
- **`read_csv_auto('foo.csv')`** — DuckDB only. The OSS/external-table loader
  per engine needs its own equivalent.
- **`SHOW TABLES`** + **`DESCRIBE`** — used by `listTables`. Hologres uses
  `information_schema`; MaxCompute uses `SHOW TABLES;` differently.

When implementing a non-DuckDB engine, the cleanest approach is:

1. Add a `dialect: "duckdb" | "postgres" | "maxcompute"` parameter to
   `pipelineToSql.ts`.
2. Branch on it where SQL differs (likely 3–5 places).
3. Re-export the same `stageToSql(stage, dialect)` signature.

## Why not just use Postgres for transforms too?

The persistent server-side DB (SQLite dev / ApsaraDB-PG prod) stores
pipeline **definitions** — prompt text, stage JSON, layout. It is *not* a
data warehouse. We don't run user transforms against it because:

- Pipeline definitions are mostly inserts + small reads, not analytics.
- Mixing user data into the persistent DB couples two lifetimes that
  shouldn't be coupled (a pipeline is forever; a CSV is per-session).
- The persistent DB doesn't need to scale with user data size.

Keep them separate.
