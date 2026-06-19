import { Router, type Request, type Response } from "express";
import { db, schema } from "../db/index.js";
import { makeQwen, QWEN_MODEL } from "../lib/qwen.js";

const SYSTEM_PROMPT = `You are a data-engineering autopilot. Given a natural-language
description, emit a JSON document describing a data-transformation pipeline.

Schema:
{
  "datasets": {
    "<dataset_id>": {
      "name": string,
      "columns": [
        { "name": string, "type": "integer"|"float"|"string"|"boolean"|"date"|"timestamp"|"unknown" }
      ]
    }
  },
  "stages": [{
    "id": string,
    "name": string,
    "type": "LOAD"|"FILTER"|"JOIN"|"UNION"|"GROUP"|"SORT"|"SELECT"|"PIVOT"|"UNPIVOT"|"DEDUPE"|"VALIDATE"|"LOOKUP"|"FORMULA"|"WINDOW"|"CUSTOM",
    "depends_on": string[],
    "inputs": string[],
    "output": string,
    "operation": object
  }]
}

Every stage MUST include an "operation" object. Here is what it looks like for
each stage type — match the shape exactly:

- LOAD:    {"stageType":"LOAD","tableName":"<dataset_id>"}
- FILTER:  {"stageType":"FILTER","table":"<input>","column":"<col>","operator":"="|"!="|">"|"<"|">="|"<="|"LIKE"|"IN","value":"<string>"}
- JOIN:    {"stageType":"JOIN","joinType":"INNER"|"LEFT"|"RIGHT"|"FULL OUTER","leftTable":"<input1>","rightTable":"<input2>","leftKey":"<col>","rightKey":"<col>"}
- GROUP:   {"stageType":"GROUP","table":"<input>","groupBy":["<col>",...],"aggregations":[{"fn":"COUNT"|"SUM"|"AVG"|"MIN"|"MAX","column":"<col>","alias":"<out_col>"}]}
- SORT:    {"stageType":"SORT","table":"<input>","orderBy":[{"column":"<col>","direction":"ASC"|"DESC"}]}
- SELECT:  {"stageType":"SELECT","table":"<input>","columns":["<col>",...]}
- UNION:   {"stageType":"UNION","tables":["<input1>","<input2>"],"unionAll":true}
- DEDUPE:  {"stageType":"DEDUPE","table":"<input>","columns":["<col>",...]}

Rules:
- Reply with a single JSON object only — no markdown, no commentary.
- Stage "type" values are UPPERCASE. Column "type" values are lowercase.
- Use ONLY the 15 stage types listed above. Do NOT invent new ones like AGGREGATE, LIMIT, COUNT, TOP, COMPUTE — pick the closest match (TOP N → SORT then SELECT; LIMIT is not supported).
- Every stage object MUST include "operation" with "stageType" matching the stage's "type".
- "inputs"/"output" must reference a dataset id or another stage's "output". "depends_on" lists stage ids this stage reads from.
- Keep dataset and stage ids short, snake_case.

CONVERSATIONAL CONTEXT:
- The user may be following up on a prior turn. If a CURRENT PIPELINE is provided (see below), you MUST treat the user's prompt as an EDIT, not a fresh request.
- Preserve every existing stage id exactly as given. Carry them through unchanged in your response.
- Add NEW stages with fresh ids (e.g., "sort_by_total" appended to the existing chain). Never reuse an existing stage's id for a new stage.
- Return the FULL updated pipeline — existing stages PLUS any new ones. Omitting existing stages will silently wipe the user's canvas.
- Only remove a stage if the user explicitly asks for it ("remove the filter", "drop the sort step", etc.).

After the pipeline JSON, ALSO include at the top level:

1. "followups" — 2–3 short next-step chips. Each: {"label": "1-4 word chip", "prompt": "full sentence the user might send next"}.

2. "report" — a brief analysis report grounded in the pipeline you just emitted, shaped as:
   {
     "markdown": "2–4 short paragraphs explaining what the pipeline does and what the user can expect to see. Reference column names, filters, aggregations. No headers; just prose. At least 80 chars.",
     "chart": {
       "type": "bar" | "line",
       "title": "short chart title",
       "data": [{"name": "<category-or-timestep>", "value": <number>}]   // 2-8 entries
     }
   }
   Pick "bar" for category breakdowns (e.g., totals by region), "line" for time series. For grouped pipelines, infer chart data from the GROUP stage's groupBy + aggregations (e.g., one entry per group, name = the group value, value = the aggregate). For non-aggregated pipelines, use representative top rows from the final stage. The chart MUST have a non-empty data array.

Final shape:
{
  "datasets": {...},
  "stages": [...],
  "followups": [{"label":"...","prompt":"..."}, ...],
  "report": { "markdown": "...", "chart": { "type": "bar"|"line", "title": "...", "data": [{"name":"...","value":...}, ...] } }
}`;

export const generateFlowRouter = Router();

generateFlowRouter.post(
  "/generate-flow",
  async (req: Request, res: Response) => {
    const prompt =
      typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    if (!prompt) {
      res.status(400).json({ error: "Missing `prompt` (string)" });
      return;
    }

    try {
      const headerKey = req.header("x-dashscope-api-key");
      const qwen = makeQwen(headerKey);
      const tables = Array.isArray(req.body?.tables) ? req.body.tables : [];
      const history = Array.isArray(req.body?.history) ? req.body.history : [];
      const currentPipeline =
        req.body?.currentPipeline &&
        typeof req.body.currentPipeline === "object"
          ? req.body.currentPipeline
          : null;

      // Inline the live schema so the model writes its pipeline against
      // tables that actually exist in the user's DuckDB session.
      const schemaContext =
        tables.length > 0
          ? `\nAvailable tables (live from the user's DuckDB):\n${JSON.stringify(
              tables,
              null,
              2,
            )}\nUse these exact names in LOAD/JOIN/FILTER. Do not invent tables.`
          : "";
      // Hand the model the current canvas so it extends instead of replacing.
      const pipelineContext = currentPipeline
        ? `\nCURRENT PIPELINE (already on the user's canvas — extend it, don't replace it):\n${JSON.stringify(
            currentPipeline,
            null,
            2,
          )}\nReuse EXISTING stage ids exactly. Add new stages with fresh ids. Return the FULL updated pipeline (existing stages + any new ones) — never omit a stage that's currently on the canvas unless the user explicitly asked you to remove it.`
        : "";

      // Cap history to prevent runaway context. Roles are coerced to OpenAI
      // schema; anything malformed is dropped.
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

      const completion = await qwen.chat.completions.create({
        model: QWEN_MODEL,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT + schemaContext + pipelineContext,
          },
          ...historyMessages,
          { role: "user", content: prompt },
        ],
      });

      const raw = completion.choices[0]?.message?.content ?? "";
      let ai: unknown;
      try {
        ai = JSON.parse(raw);
      } catch {
        res
          .status(502)
          .json({ error: "Qwen returned non-JSON content", raw });
        return;
      }

      const [row] = await db
        .insert(schema.pipelines)
        .values({ promptText: prompt })
        .returning({ id: schema.pipelines.id });

      const aiObj = ai as { stages?: Array<{ id: string }> };
      if (Array.isArray(aiObj.stages) && aiObj.stages.length > 0) {
        await db.insert(schema.pipelineNodes).values(
          aiObj.stages.map((stage) => ({
            pipelineId: row.id,
            nodeKey: stage.id,
            data: stage,
          })),
        );
      }

      // Pull followups + report off the same JSON if the model included them.
      // Strip them from `ai` so the canvas validator only sees datasets +
      // stages — neither field belongs in AIPipelineSchema.
      const aiPayload = ai as {
        followups?: Array<{ label?: unknown; prompt?: unknown }>;
        report?: {
          markdown?: unknown;
          chart?: {
            type?: unknown;
            title?: unknown;
            data?: Array<{ name?: unknown; value?: unknown }>;
          };
        };
      };
      const rawFollowups = Array.isArray(aiPayload.followups)
        ? aiPayload.followups
        : [];
      const followups: Array<{ label: string; prompt: string }> = [];
      for (const f of rawFollowups) {
        if (!f || typeof f !== "object") continue;
        const label = typeof f.label === "string" ? f.label.trim() : "";
        const promptText = typeof f.prompt === "string" ? f.prompt.trim() : "";
        if (label && promptText) followups.push({ label, prompt: promptText });
      }
      delete aiPayload.followups;

      // Validate the optional report payload — keep the typed shape clean.
      let report: {
        markdown: string;
        chart?: {
          type: "bar" | "line";
          title?: string;
          data: Array<{ name: string; value: number }>;
        };
      } | null = null;
      const rawReport = aiPayload.report;
      if (rawReport && typeof rawReport === "object") {
        const md =
          typeof rawReport.markdown === "string" ? rawReport.markdown.trim() : "";
        if (md.length >= 20) {
          let chart:
            | {
                type: "bar" | "line";
                title?: string;
                data: Array<{ name: string; value: number }>;
              }
            | undefined;
          const rawChart = rawReport.chart;
          if (rawChart && typeof rawChart === "object") {
            const type = rawChart.type;
            const data: Array<{ name: string; value: number }> = [];
            if (Array.isArray(rawChart.data)) {
              for (const row of rawChart.data) {
                if (!row || typeof row !== "object") continue;
                const name =
                  typeof row.name === "string"
                    ? row.name
                    : row.name == null
                    ? ""
                    : String(row.name);
                const value =
                  typeof row.value === "number" && Number.isFinite(row.value)
                    ? row.value
                    : NaN;
                if (name && Number.isFinite(value)) data.push({ name, value });
              }
            }
            if ((type === "bar" || type === "line") && data.length > 0) {
              chart = {
                type,
                ...(typeof rawChart.title === "string"
                  ? { title: rawChart.title }
                  : {}),
                data,
              };
            }
          }
          report = { markdown: md, ...(chart ? { chart } : {}) };
        }
      }
      delete aiPayload.report;

      res.json({ pipelineId: row.id, ai, followups, report });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  },
);
