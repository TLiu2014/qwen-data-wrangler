import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import pg from "pg";
import * as pgSchema from "./schema.js";
import * as sqliteSchema from "./schema-sqlite.js";

/**
 * Two-mode persistence:
 *   - NODE_ENV=production → Aliyun ApsaraDB / PolarDB via standard `pg`.
 *   - otherwise            → local SQLite file via `better-sqlite3`.
 *
 * Routes import `{ db, schema }` and use the same `.insert().values().returning()`
 * API in both modes. We export `db`/`schema` as `any` because the adapter types
 * diverge between dialects and the route code is intentionally dialect-agnostic.
 */

const isProd = process.env.NODE_ENV === "production";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let schema: any;

if (isProd) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set (required in production)");
  }
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.PGSSLMODE === "disable"
        ? false
        : { rejectUnauthorized: false },
  });
  db = drizzlePg(pool, { schema: pgSchema });
  schema = pgSchema;
} else {
  const sqlitePath = process.env.SQLITE_PATH ?? "./qwen.sqlite";
  const sqlite = new Database(sqlitePath);
  // Bootstrap tables without a migration step so `npm run dev` just works.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS pipelines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pipeline_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pipeline_id INTEGER NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
      node_key TEXT NOT NULL,
      data TEXT NOT NULL
    );
  `);
  db = drizzleSqlite(sqlite, { schema: sqliteSchema });
  schema = sqliteSchema;
  // eslint-disable-next-line no-console
  console.log(
    `[db] using local SQLite at ${sqlitePath} (NODE_ENV=${
      process.env.NODE_ENV ?? "(unset)"
    })`,
  );
}

export { db, schema };
