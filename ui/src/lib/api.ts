import type {
  AIPipelineSchema,
  DatasetSchema,
  StageType,
} from "@flow";

/**
 * StageType values the lib's switch in `computeStageOutput` handles. Anything
 * else falls off the end of the switch, `computeStageOutput` returns
 * `undefined`, and a later `s.output` access crashes the canvas. We reject
 * unknown values up front with a readable error instead.
 */
const VALID_STAGE_TYPES = new Set<StageType>([
  "LOAD",
  "FILTER",
  "JOIN",
  "UNION",
  "GROUP",
  "SORT",
  "SELECT",
  "PIVOT",
  "UNPIVOT",
  "DEDUPE",
  "VALIDATE",
  "LOOKUP",
  "FORMULA",
  "WINDOW",
  "CUSTOM",
]);

/**
 * Stricter than `validateAIPipelineSchema` from the lib (which only checks
 * top-level shape). Returns the first problem encountered as a human-readable
 * string, or `null` when the payload is safe to render.
 */
export function strictValidateAIPipelineSchema(value: unknown): string | null {
  if (!value || typeof value !== "object") return "Expected an object";
  const v = value as { datasets?: unknown; stages?: unknown };
  if (!v.datasets || typeof v.datasets !== "object")
    return "Missing or invalid `datasets` object";
  if (!Array.isArray(v.stages)) return "Missing or invalid `stages` array";
  for (let i = 0; i < v.stages.length; i++) {
    const s = v.stages[i] as
      | { id?: unknown; type?: unknown; output?: unknown; operation?: unknown }
      | null;
    if (!s || typeof s !== "object") return `stages[${i}] is not an object`;
    if (typeof s.id !== "string" || !s.id)
      return `stages[${i}].id missing or not a string`;
    if (typeof s.output !== "string" || !s.output)
      return `stages[${i}] (id="${String(s.id)}").output missing or not a string`;
    if (typeof s.type !== "string" || !VALID_STAGE_TYPES.has(s.type as StageType))
      return `stages[${i}] (id="${String(s.id)}") has invalid type "${String(
        s.type,
      )}". Use UPPERCASE: ${[...VALID_STAGE_TYPES].join(", ")}.`;
    if (!s.operation || typeof s.operation !== "object")
      return `stages[${i}] (id="${String(s.id)}").operation missing`;
  }
  return null;
}

/**
 * Coerce optional arrays to `[]` so downstream code that does
 * `stage.inputs.map(...)` never sees undefined. Doesn't mutate input.
 */
export function coerceAIPipelineSchema(ai: AIPipelineSchema): AIPipelineSchema {
  return {
    datasets: ai.datasets ?? {},
    stages: ai.stages.map((s) => ({
      ...s,
      depends_on: Array.isArray(s.depends_on) ? s.depends_on : [],
      inputs: Array.isArray(s.inputs) ? s.inputs : [],
    })),
  };
}

/**
 * Live table descriptor the UI ships with each prompt so the agent's schema
 * awareness matches what DuckDB actually has loaded — bundled samples plus
 * any user-uploaded CSVs.
 */
export interface TableDescriptor {
  name: string;
  columns: Array<{ name: string; type: string }>;
  rowCount?: number;
}

/** Prior chat turn — only `user` and `assistant` roles, traces/errors excluded. */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateFlowRequest {
  prompt: string;
  datasets?: Record<string, DatasetSchema>;
  tables?: TableDescriptor[];
  /** Recent user/assistant turns (oldest first) so the model has conversational memory. */
  history?: ChatTurn[];
  /** Whatever's currently on the canvas — the model is told to extend, not replace. */
  currentPipeline?: AIPipelineSchema;
  /** When provided, sent as a request header and used in place of the server's DASHSCOPE_API_KEY. */
  apiKey?: string;
}

export interface GenerateFlowResponse {
  pipelineId: number;
  ai: AIPipelineSchema;
  /** Manual-mode follow-up chips Qwen emits alongside the pipeline. May be empty. */
  followups: Array<{ label: string; prompt: string }>;
  /** Optional markdown report + chart Qwen emits alongside the pipeline. */
  report: { markdown: string; chart?: ChartSpec } | null;
}

export async function generateFlow(
  body: GenerateFlowRequest,
): Promise<GenerateFlowResponse> {
  const { apiKey, ...payload } = body;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (apiKey && apiKey.trim()) headers["x-dashscope-api-key"] = apiKey.trim();
  // `tables` is passed as part of the JSON body so the agent's schema view
  // matches the user's actual DuckDB-WASM state (samples + uploads).

  const res = await fetch("/api/generate-flow", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`generate-flow failed (${res.status}): ${text}`);
  }
  return (await res.json()) as GenerateFlowResponse;
}

/* ────────────────────────────── Autopilot ──────────────────────────────── */

/**
 * Chart payload as emitted by the autopilot's `write_report` tool and as
 * stored in the sample report. The model returns this as JSON over the SSE
 * stream; the host renders it via `<ReportView>` (Recharts BarChart or
 * LineChart). One `{name, value}` row per category/timestep.
 */
export interface ChartSpec {
  type: "bar" | "line";
  title?: string;
  data: Array<{ name: string; value: number }>;
}

/** One follow-up chip the agent suggests at the end of a turn. */
export interface SuggestionChip {
  label: string;
  prompt: string;
}

/** One alternative pipeline option emitted by `propose_alternatives`. */
export interface PipelineAlternative {
  label: string;
  hint?: string;
  pipeline: AIPipelineSchema;
}

export type AutopilotEvent =
  | { type: "trace"; label: string; icon?: string; details?: string }
  | { type: "pipeline"; ai: AIPipelineSchema }
  | { type: "alternatives"; items: PipelineAlternative[] }
  | { type: "report"; markdown: string; chart?: ChartSpec }
  | { type: "suggestions"; chips: SuggestionChip[] }
  | { type: "error"; message: string }
  | { type: "done" };

export interface StreamAutopilotRequest {
  prompt: string;
  apiKey?: string;
  tables?: TableDescriptor[];
  history?: ChatTurn[];
  currentPipeline?: AIPipelineSchema;
  signal?: AbortSignal;
  onEvent: (event: AutopilotEvent) => void;
}

/**
 * POST to /api/autopilot and dispatch each SSE chunk to `onEvent`. Resolves
 * when the stream ends (server closed) — the caller decides what to do with
 * intermediate events.
 */
export async function streamAutopilot({
  prompt,
  apiKey,
  tables,
  history,
  currentPipeline,
  signal,
  onEvent,
}: StreamAutopilotRequest): Promise<void> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "text/event-stream",
  };
  if (apiKey && apiKey.trim()) headers["x-dashscope-api-key"] = apiKey.trim();

  const res = await fetch("/api/autopilot", {
    method: "POST",
    headers,
    body: JSON.stringify({ prompt, tables, history, currentPipeline }),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`autopilot failed (${res.status}): ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // SSE messages are separated by a blank line.
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const line = chunk.trim();
      if (!line.startsWith("data:")) continue;
      const json = line.slice("data:".length).trim();
      try {
        onEvent(JSON.parse(json) as AutopilotEvent);
      } catch {
        // ignore malformed frames
      }
    }
  }
}
