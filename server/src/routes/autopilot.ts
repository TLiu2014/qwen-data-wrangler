import { Router, type Request, type Response } from "express";
import { stepCountIs, streamText, tool } from "ai";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import { qwenWithKey, QWEN_MODEL } from "../lib/qwen-ai.js";

const SYSTEM_PROMPT = `You are an autonomous SQL data analyst.

You have these tools and call them in this order:
1. inspect_schema()                                  — discover available tables.
2. propose_pipeline({datasets, stages})              — typical case: one pipeline answering the question.
   OR
   propose_alternatives({alternatives: [...]})       — RARE: only when the question genuinely has multiple
                                                        worthwhile angles to compare (e.g., revenue by region
                                                        vs by category vs by month). Default to propose_pipeline.
3. analyze({stage_id, metric})                       — pull summary rows from a stage.
4. write_report({markdown, chart})                   — finalize with markdown + a bar/line chart.
5. suggest_followups({prompts: [{label, prompt}, ...]}) — 2–3 contextual next-step prompts the user might pick.

Never call BOTH propose_pipeline and propose_alternatives in the same turn. Pick one.

EVERY turn MUST end with both:
  write_report({markdown, chart})   — at least 2 paragraphs of markdown grounded in the analyze result, AND a bar/line chart whose data field is non-empty.
  suggest_followups({prompts: [...]}) — 2 or 3 contextual next-step prompts.

Do NOT stop early — even for prompts like "show me an analysis report" you MUST call inspect_schema → propose_pipeline → analyze → write_report → suggest_followups. A turn without write_report is a failed turn.

CONVERSATIONAL CONTEXT:
- When the system message includes "CURRENT PIPELINE", the user is following up on a prior turn. Treat the new prompt as an EDIT to that pipeline, not a fresh request.
- propose_pipeline MUST include every existing stage with its id unchanged, plus any new stages with fresh ids. Never drop an existing stage unless the user explicitly asked to remove it.
- inspect_schema is still useful on follow-ups when the user references columns or tables the current pipeline doesn't reach.

Pipeline rules (these match the canvas renderer):
- Stage "type" values are UPPERCASE: LOAD | FILTER | JOIN | UNION | GROUP | SORT | SELECT | PIVOT | UNPIVOT | DEDUPE | VALIDATE | LOOKUP | FORMULA | WINDOW | CUSTOM.
- Column "type" values are lowercase: integer | float | string | boolean | date | timestamp | unknown.
- Every "inputs"/"output" string must match a dataset id or another stage's "output".
- Each stage object is: {id, name, type, depends_on:[stageIds], inputs:[dsIds], output:dsId, operation:{stageType,...}}.

Report rules:
- 2–4 short paragraphs of markdown — what was asked, what the pipeline does, what the numbers show.
- The chart must reflect the analyze result (bar for category totals, line for time series).
- Be terse. No filler. The user can already see the pipeline on the canvas.`;

interface AutopilotSseEvent {
  type:
    | "trace"
    | "pipeline"
    | "alternatives"
    | "report"
    | "suggestions"
    | "error"
    | "done";
  [k: string]: unknown;
}

export const autopilotRouter = Router();

autopilotRouter.post("/autopilot", async (req: Request, res: Response) => {
  const prompt =
    typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt) {
    res.status(400).json({ error: "Missing `prompt` (string)" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (event: AutopilotSseEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  let proposedPipeline: unknown = null;

  try {
    const headerKey = req.header("x-dashscope-api-key");
    const qwen = qwenWithKey(headerKey);

    // Tables provided by the client reflect the live DuckDB-WASM state
    // (bundled samples + user uploads). Fall back to an empty schema if the
    // client didn't send anything — the model will then ask for clarification.
    const liveTables: Array<{
      name: string;
      columns: Array<{ name: string; type: string }>;
      rowCount?: number;
    }> = Array.isArray(req.body?.tables) ? req.body.tables : [];
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const currentPipeline =
      req.body?.currentPipeline &&
      typeof req.body.currentPipeline === "object"
        ? req.body.currentPipeline
        : null;

    // Project prior chat turns into the messages array Qwen consumes.
    const historyMessages: Array<{
      role: "user" | "assistant";
      content: string;
    }> = [];
    for (const turn of history.slice(-8)) {
      if (!turn || typeof turn !== "object") continue;
      const role = (turn as { role?: unknown }).role;
      const content = (turn as { content?: unknown }).content;
      if (
        (role === "user" || role === "assistant") &&
        typeof content === "string" &&
        content.length > 0
      ) {
        historyMessages.push({ role, content });
      }
    }

    const tools = {
      inspect_schema: tool({
        description:
          "Inspect the user's currently-loaded tables (bundled samples + any uploaded CSVs) and return their column schemas with row counts.",
        inputSchema: z.object({}).strict(),
        execute: async () => {
          send({
            type: "trace",
            icon: "🔍",
            label: "Looking at the available tables…",
          });
          if (liveTables.length === 0) {
            return {
              tables: {},
              note: "No tables are currently loaded in the user's session.",
            };
          }
          const out: Record<string, unknown> = {};
          for (const t of liveTables) {
            out[t.name] = {
              columns: t.columns,
              row_count: t.rowCount,
            };
          }
          return { tables: out };
        },
      }),

      propose_alternatives: tool({
        description:
          "Use ONLY when the user's question has multiple genuinely different angles worth comparing (e.g., revenue by region vs by category vs by month). Return 2 or 3 distinct PipelineSchema-shaped alternatives the UI will let the user pick between. For typical single-angle prompts, prefer propose_pipeline instead.",
        inputSchema: z.object({
          alternatives: z
            .array(
              z.object({
                label: z.string().min(2).max(40),
                hint: z.string().optional(),
                pipeline: z.object({
                  datasets: z.record(z.string(), z.any()),
                  stages: z
                    .array(
                      z.object({
                        id: z.string().min(1),
                        name: z.string().min(1),
                        type: z.enum([
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
                        ]),
                        depends_on: z.array(z.string()).default([]),
                        inputs: z.array(z.string()).default([]),
                        output: z.string().min(1),
                        operation: z.record(z.string(), z.any()),
                      }),
                    )
                    .min(1),
                }),
              }),
            )
            .min(2)
            .max(3),
        }),
        execute: async ({ alternatives }) => {
          send({
            type: "trace",
            icon: "🪞",
            label: `Proposing ${alternatives.length} alternatives…`,
          });
          // The first alternative is also treated as the primary pipeline so
          // the canvas isn't blank while the user is deciding.
          if (alternatives[0]) {
            proposedPipeline = alternatives[0].pipeline;
            send({ type: "pipeline", ai: alternatives[0].pipeline });
          }
          send({ type: "alternatives", items: alternatives });
          return { ok: true, count: alternatives.length };
        },
      }),

      propose_pipeline: tool({
        description:
          "Emit a typed PipelineSchema-shaped pipeline to render on the canvas.",
        // Strict shape — if Qwen omits `operation` or invents a non-canonical
        // `type`, the tool call fails and the agent gets a chance to retry.
        inputSchema: z.object({
          datasets: z.record(z.string(), z.any()),
          stages: z
            .array(
              z.object({
                id: z.string().min(1),
                name: z.string().min(1),
                type: z.enum([
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
                ]),
                depends_on: z.array(z.string()).default([]),
                inputs: z.array(z.string()).default([]),
                output: z.string().min(1),
                operation: z.record(z.string(), z.any()),
              }),
            )
            .min(1),
        }),
        execute: async (input) => {
          const stageCount = Array.isArray(input.stages) ? input.stages.length : 0;
          send({
            type: "trace",
            icon: "✍️",
            label: `Sketching the pipeline (${stageCount} stages)…`,
          });
          proposedPipeline = input;
          send({ type: "pipeline", ai: input });
          return { ok: true, stage_count: stageCount };
        },
      }),

      analyze: tool({
        description:
          "Return summary rows for a stage. Use metric to pick a precomputed aggregate.",
        inputSchema: z.object({
          stage_id: z.string(),
          metric: z
            .string()
            .describe(
              "e.g., total_revenue_by_region, count_by_category, monthly_revenue",
            ),
        }),
        execute: async ({ stage_id, metric }) => {
          send({
            type: "trace",
            icon: "📊",
            label: `Crunching ${metric} from ${stage_id}…`,
          });
          const m = metric.toLowerCase();
          if (m.includes("region")) {
            return {
              rows: [
                { region: "North", total_revenue: 1468.48 },
                { region: "South", total_revenue: 245.49 },
                { region: "East", total_revenue: 67.0 },
                { region: "West", total_revenue: 22.99 },
              ],
            };
          }
          if (m.includes("category")) {
            return {
              rows: [
                { product_category: "Electronics", total: 1949.97 },
                { product_category: "Clothing", total: 268.5 },
                { product_category: "Books", total: 135.49 },
              ],
            };
          }
          if (m.includes("month")) {
            return {
              rows: [
                { month: "2024-01", revenue: 434.49 },
                { month: "2024-02", revenue: 957.47 },
                { month: "2024-03", revenue: 1011.99 },
              ],
            };
          }
          return {
            rows: [],
            note: "No precomputed metric matched — pick total_revenue_by_region, count_by_category, or monthly_revenue.",
          };
        },
      }),

      suggest_followups: tool({
        description:
          "Suggest 2–3 short follow-up requests the user might want to make next. Call this once at the end of every turn, AFTER write_report. The UI renders these as clickable chips under the last assistant message; clicking fills the user's input box (does NOT auto-send).",
        inputSchema: z.object({
          prompts: z
            .array(
              z.object({
                label: z.string().min(1).max(40),
                prompt: z.string().min(8),
              }),
            )
            .min(2)
            .max(3),
        }),
        execute: async ({ prompts }) => {
          send({
            type: "trace",
            icon: "💡",
            label: `Suggesting ${prompts.length} follow-ups…`,
          });
          send({ type: "suggestions", chips: prompts });
          return { ok: true };
        },
      }),

      write_report: tool({
        description:
          "Final step: emit the markdown report + optional bar/line chart. Call exactly once at the end.",
        inputSchema: z.object({
          markdown: z.string().min(20),
          chart: z
            .object({
              type: z.enum(["bar", "line"]),
              title: z.string().optional(),
              data: z
                .array(z.object({ name: z.string(), value: z.number() }))
                .min(1),
            })
            .optional(),
        }),
        execute: async ({ markdown, chart }) => {
          send({ type: "trace", icon: "📝", label: "Writing up the findings…" });
          send({ type: "report", markdown, chart });
          return { ok: true };
        },
      }),
    };

    const pipelineContext = currentPipeline
      ? `\n\nCURRENT PIPELINE (already on the user's canvas — extend it, don't replace it):\n${JSON.stringify(
          currentPipeline,
          null,
          2,
        )}\nReuse EXISTING stage ids exactly. Add new stages with fresh ids. Return the FULL updated pipeline (existing + any new stages) via propose_pipeline.`
      : "";

    const result = streamText({
      model: qwen(QWEN_MODEL),
      messages: [
        { role: "system", content: SYSTEM_PROMPT + pipelineContext },
        ...historyMessages,
        { role: "user", content: prompt },
      ],
      tools,
      // Floor of 12 steps so qwen-turbo has headroom for inspect → propose →
      // analyze → write_report → suggest_followups even with a retry or two.
      stopWhen: stepCountIs(12),
    });

    for await (const part of result.fullStream) {
      if (part.type === "tool-error") {
        send({
          type: "trace",
          icon: "🚨",
          label: `Tool error in ${part.toolName}`,
        });
      } else if (part.type === "error") {
        const msg =
          part.error instanceof Error ? part.error.message : String(part.error);
        send({ type: "error", message: msg });
      }
      // tool-call/tool-result side-effects already emit via `execute`.
      // text/reasoning deltas are intentionally ignored — the report is what
      // the user sees, not the agent's chain-of-thought.
    }

    // Persist whatever pipeline the agent ended up with.
    if (proposedPipeline) {
      try {
        const [row] = await db
          .insert(schema.pipelines)
          .values({ promptText: prompt })
          .returning({ id: schema.pipelines.id });
        const stages = (proposedPipeline as { stages?: Array<{ id: string }> })
          .stages;
        if (Array.isArray(stages) && stages.length > 0) {
          await db.insert(schema.pipelineNodes).values(
            stages.map((stage) => ({
              pipelineId: row.id,
              nodeKey: stage.id,
              data: stage,
            })),
          );
        }
      } catch (err) {
        // Persistence failure shouldn't kill the response — the UI already has
        // everything it needs from the stream.
        const msg = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.warn("[autopilot] persistence failed:", msg);
      }
    }

    send({ type: "done" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    send({ type: "error", message: msg });
  } finally {
    res.end();
  }
});
