import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import "./index.css";
import { App } from "./App";
import { ensureEngineReady } from "@/lib/queryEngine";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Kick off DuckDB-WASM as early as possible — fetching the worker + wasm
// bundle takes 1-3 s on a cold cache. By the time the user reads the page
// and types a prompt, the engine is usually already connected.
ensureEngineReady().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error("[duckdb] preload failed:", err);
});
