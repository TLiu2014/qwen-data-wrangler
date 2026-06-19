import { BrowserDuckDBEngine } from "./browserDuckDB";
import type { QueryEngine } from "./types";
import { SAMPLE_CUSTOMERS_CSV, SAMPLE_ORDERS_CSV } from "@/samples";

export type { QueryEngine, RegisteredTable } from "./types";
export { stageToSql, topologicalOrder } from "./pipelineToSql";

/**
 * Singleton engine instance. Built once, kept alive for the lifetime of the
 * tab — DuckDB holds an AsyncDuckDBConnection internally so subsequent
 * queries reuse the same worker without reconnecting. We preload the
 * bundled sample CSVs the first time `ensureEngineReady` runs so they're
 * already queryable by the time the user sends a prompt.
 */
let _engine: QueryEngine | null = null;
let _readyPromise: Promise<QueryEngine> | null = null;

/**
 * `true` once the engine has finished its first-time init (worker + WASM
 * loaded, sample CSVs registered). Useful for status indicators in the UI.
 */
export let engineReady = false;

type ReadyListener = (ready: boolean) => void;
const listeners = new Set<ReadyListener>();
export function onEngineReadyChange(fn: ReadyListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getQueryEngine(): QueryEngine {
  if (!_engine) _engine = new BrowserDuckDBEngine();
  return _engine;
}

export function ensureEngineReady(): Promise<QueryEngine> {
  if (_readyPromise) return _readyPromise;
  const engine = getQueryEngine();
  _readyPromise = (async () => {
    await engine.ready();
    await engine.registerCsv("customers", SAMPLE_CUSTOMERS_CSV);
    await engine.registerCsv("orders", SAMPLE_ORDERS_CSV);
    engineReady = true;
    listeners.forEach((fn) => fn(true));
    return engine;
  })();
  return _readyPromise;
}
