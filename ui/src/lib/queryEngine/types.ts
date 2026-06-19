import type { PipelineSchema, StageResult } from "@flow";

/**
 * Live schema description that gets sent to the agent so it knows what
 * columns are available. Keys are table names; columns must match what
 * the engine actually has registered.
 */
export interface RegisteredTable {
  name: string;
  columns: Array<{ name: string; type: string }>;
  /** Estimated row count (DuckDB COUNT(*) result; may be omitted for cheapness). */
  rowCount?: number;
}

/**
 * Pluggable SQL execution engine. The browser implementation runs DuckDB
 * inside the tab via WASM; server-side implementations (Function Compute +
 * DuckDB, Hologres, AnalyticDB-PG, MaxCompute) can be wired behind the same
 * interface without changing the agent or the UI. See `docs/query-engine.md`
 * for the option tracker.
 */
export interface QueryEngine {
  /** Block until the engine is ready to accept calls. Safe to call repeatedly. */
  ready(): Promise<void>;

  /**
   * Register a table from a CSV string under `name`. Replaces an existing
   * table of the same name. Used for both bundled samples and uploads.
   */
  registerCsv(name: string, csvText: string): Promise<void>;

  /** List currently-registered tables with their column schemas. */
  listTables(): Promise<RegisteredTable[]>;

  /** Drop a previously-registered table. No-op if it doesn't exist. */
  unregisterTable(name: string): Promise<void>;

  /**
   * Walk the pipeline in dependency order, materializing each stage's
   * output as a VIEW or TABLE. Returns the per-stage result rows (capped at
   * `rowLimit`, default 200) so the UI can pour them straight into the
   * `<ResultsView>` tab strip.
   */
  executePipeline(
    schema: PipelineSchema,
    options?: { rowLimit?: number },
  ): Promise<Record<string, StageResult>>;
}
