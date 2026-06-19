import { useEffect, useState } from "react";
import { engineReady, onEngineReadyChange } from "@/lib/queryEngine";

/**
 * Tracks the DuckDB-WASM preload state so UI components can show "warming
 * up" vs "ready". `engineReady` is initialised to whatever the singleton
 * already knows (so late mounts don't briefly flash "warming up").
 */
export function useEngineReady(): boolean {
  const [ready, setReady] = useState<boolean>(engineReady);
  useEffect(() => onEngineReadyChange(setReady), []);
  return ready;
}
