import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";
export type LayoutMode = "horizontal" | "vertical";

/**
 * Which sample pipeline to seed the canvas with.
 *   "two-sources"       — just `load_customers` and `load_orders` (default).
 *   "revenue-by-region" — the full LOAD × 2 → JOIN → FILTER → GROUP pipeline.
 */
export type SampleFlowOption = "two-sources" | "revenue-by-region";

/**
 * Chat dispatch mode:
 *   "manual"    — single-shot /api/generate-flow. One pipeline back, done.
 *   "autopilot" — /api/autopilot. Streams trace events, a pipeline, and a report.
 */
export type AgentMode = "manual" | "autopilot";

export interface Settings {
  /** Overrides the server's DASHSCOPE_API_KEY for the current session. */
  apiKey: string;
  /** "horizontal" = canvas left / results right. "vertical" = canvas top / results bottom. */
  layoutMode: LayoutMode;
  theme: ThemeMode;
  sampleFlow: SampleFlowOption;
  agentMode: AgentMode;
  /**
   * When true, clicking a suggestion chip sends it immediately. When false
   * (default — matches gemini-nosql), clicking fills the composer so the
   * user can edit before sending.
   */
  autoSendSuggestion: boolean;
}

const STORAGE_KEY = "qwen-data-wrangler:settings";

const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  layoutMode: "horizontal",
  theme: "light",
  sampleFlow: "two-sources",
  agentMode: "manual",
  autoSendSuggestion: true,
};

function load(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* sessionStorage unavailable — fail quiet */
    }
  }, [settings]);

  // Apply the theme to <html> so Tailwind's `dark:` variants flip globally.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", settings.theme === "dark");
  }, [settings.theme]);

  const update = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  return { settings, update };
}
