import * as duckdb from "@duckdb/duckdb-wasm";
import type {
  DataTableColumn,
  PipelineSchema,
  StageResult,
} from "@flow";
import type { QueryEngine, RegisteredTable } from "./types";
import { stageToSql, topologicalOrder } from "./pipelineToSql";

import duckdb_mvp_wasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import mvp_worker_url from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import duckdb_eh_wasm from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import eh_worker_url from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";

/** DuckDB column type → host-side ColumnType bucket for `DataTableColumn`. */
function mapType(duckType: string): DataTableColumn["type"] {
  const t = duckType.toLowerCase();
  if (t.includes("bool")) return "boolean";
  if (
    t.includes("int") ||
    t.includes("bigint") ||
    t.includes("smallint") ||
    t.includes("tinyint")
  )
    return "integer";
  if (
    t.includes("double") ||
    t.includes("float") ||
    t.includes("real") ||
    t.includes("decimal") ||
    t.includes("numeric")
  )
    return "float";
  if (t.includes("timestamp") || t.includes("datetime")) return "timestamp";
  if (t.includes("date")) return "date";
  if (t === "varchar" || t.includes("text") || t.includes("string"))
    return "string";
  return "unknown";
}

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: duckdb_mvp_wasm, mainWorker: mvp_worker_url },
  eh: { mainModule: duckdb_eh_wasm, mainWorker: eh_worker_url },
};

/**
 * Browser-side DuckDB execution. One instance per tab. Lazy-init on first
 * `ready()` call; subsequent calls fast-path through.
 */
export class BrowserDuckDBEngine implements QueryEngine {
  private db: duckdb.AsyncDuckDB | null = null;
  private conn: duckdb.AsyncDuckDBConnection | null = null;
  private initPromise: Promise<void> | null = null;
  /** Track CSV files we've registered (so `unregisterTable` can clean up). */
  private readonly registered = new Set<string>();

  async ready(): Promise<void> {
    if (this.conn) return;
    if (!this.initPromise) this.initPromise = this.init();
    await this.initPromise;
  }

  private async init() {
    const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
    const worker = new Worker(bundle.mainWorker!);
    const logger = new duckdb.ConsoleLogger();
    this.db = new duckdb.AsyncDuckDB(logger, worker);
    await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    this.conn = await this.db.connect();
  }

  async registerCsv(name: string, csvText: string): Promise<void> {
    await this.ready();
    if (!this.db || !this.conn) throw new Error("DuckDB not initialised");

    const filename = `${name}.csv`;
    // Re-register: if we've seen it, drop the prior virtual file first.
    if (this.registered.has(name)) {
      try {
        await this.db.dropFile(filename);
      } catch {
        /* fine — file may not exist any more */
      }
    }
    await this.db.registerFileText(filename, csvText);
    await this.conn.query(
      `CREATE OR REPLACE TABLE ${quoteIdent(name)} AS SELECT * FROM read_csv_auto('${filename}', header = true);`,
    );
    this.registered.add(name);
  }

  async unregisterTable(name: string): Promise<void> {
    await this.ready();
    if (!this.conn) return;
    await this.conn.query(`DROP TABLE IF EXISTS ${quoteIdent(name)};`);
    try {
      await this.db?.dropFile(`${name}.csv`);
    } catch {
      /* fine */
    }
    this.registered.delete(name);
  }

  async listTables(): Promise<RegisteredTable[]> {
    await this.ready();
    if (!this.conn) return [];
    const tables = await this.conn.query("SELECT name FROM (SHOW TABLES);");
    const out: RegisteredTable[] = [];
    for (const row of tables.toArray() as Array<Record<string, unknown>>) {
      const tableName = String(row.name);
      const cols = await this.conn.query(
        `DESCRIBE ${quoteIdent(tableName)};`,
      );
      const columns = (
        cols.toArray() as Array<Record<string, unknown>>
      ).map((c) => ({
        name: String(c.column_name),
        type: String(c.column_type),
      }));
      let rowCount: number | undefined;
      try {
        const cnt = await this.conn.query(
          `SELECT COUNT(*)::BIGINT AS n FROM ${quoteIdent(tableName)};`,
        );
        const raw = (cnt.toArray() as Array<Record<string, unknown>>)[0]?.n;
        rowCount = typeof raw === "bigint" ? Number(raw) : Number(raw ?? 0);
      } catch {
        rowCount = undefined;
      }
      out.push({ name: tableName, columns, rowCount });
    }
    return out;
  }

  async executePipeline(
    schema: PipelineSchema,
    options: { rowLimit?: number } = {},
  ): Promise<Record<string, StageResult>> {
    await this.ready();
    if (!this.conn) throw new Error("DuckDB not initialised");
    const rowLimit = options.rowLimit ?? 200;
    const results: Record<string, StageResult> = {};

    for (const stage of topologicalOrder(schema)) {
      const sql = stageToSql(stage);
      if (!sql) {
        // Unsupported stage — emit an empty result so the tab strip stays
        // aligned with the canvas, and continue.
        results[stage.id] = { columns: [], rows: [] };
        // eslint-disable-next-line no-console
        console.warn(
          `[BrowserDuckDB] ${stage.type} stage "${stage.id}" not supported yet — empty result.`,
        );
        continue;
      }
      try {
        await this.conn.query(sql);
        const preview = await this.conn.query(
          `SELECT * FROM ${quoteIdent(stage.output)} LIMIT ${rowLimit};`,
        );
        const fields = preview.schema.fields;
        const columns: DataTableColumn[] = fields.map((f) => ({
          name: f.name,
          type: mapType(String(f.type)),
        }));
        const rows = preview.toArray().map((r) => {
          const obj: Record<string, unknown> = {};
          for (const c of columns) {
            // BigInts won't survive JSON; coerce to number for typical sizes.
            const v = (r as unknown as Record<string, unknown>)[c.name];
            obj[c.name] = typeof v === "bigint" ? Number(v) : v;
          }
          return obj;
        });
        results[stage.id] = { columns, rows };
      } catch (err) {
        // Don't blow up the whole pipeline because one stage failed — log,
        // emit empty, and let the user see which stage broke.
        const msg = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.warn(
          `[BrowserDuckDB] stage "${stage.id}" failed: ${msg}\nSQL: ${sql}`,
        );
        results[stage.id] = { columns: [], rows: [] };
      }
    }

    return results;
  }
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
