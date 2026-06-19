import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Database,
  ExternalLink,
  GitBranch,
  Layers,
  Network,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";

const SECTIONS = [
  { id: "architecture", label: "Architecture" },
  { id: "endpoints", label: "HTTP endpoints" },
  { id: "tools", label: "Autopilot tools" },
  { id: "sse", label: "SSE event protocol" },
  { id: "query-engine", label: "QueryEngine" },
  { id: "stack", label: "Stack & resources" },
];

const TOOLS: Array<{
  id: string;
  name: string;
  purpose: string;
  args: string;
  emits: string;
}> = [
  {
    id: "tool-inspect_schema",
    name: "inspect_schema",
    purpose:
      "Discover the user's currently-loaded tables (bundled samples + uploaded CSVs).",
    args: "{}",
    emits:
      "Trace · Returns: { tables: { [name]: { columns, row_count } } } drawn from the live DuckDB-WASM state the client posts with each request.",
  },
  {
    id: "tool-propose_pipeline",
    name: "propose_pipeline",
    purpose:
      "Emit a single typed PipelineSchema. Used for the typical case — one pipeline answers the question.",
    args: "{ datasets: Record<string, DatasetSchema>, stages: SerializedStage[] }",
    emits:
      "Trace + `pipeline` SSE event. UI re-layouts the schema and runs it through DuckDB.",
  },
  {
    id: "tool-propose_alternatives",
    name: "propose_alternatives",
    purpose:
      "RARE — emit 2–3 alternative pipelines when the prompt is multi-angle (e.g., by region vs by category vs by month). Mutually exclusive with propose_pipeline in a single turn.",
    args:
      "{ alternatives: Array<{ label, hint?, pipeline: PipelineSchema }> } (min 2, max 3)",
    emits:
      "Trace + a `pipeline` event for the first alternative + an `alternatives` event with the full list. UI renders an Alt picker over the canvas.",
  },
  {
    id: "tool-analyze",
    name: "analyze",
    purpose:
      "Pull summary rows from a stage to ground the report. Today returns precomputed aggregates per metric name; future versions will route through QueryEngine.",
    args: "{ stage_id: string, metric: string }",
    emits:
      "Trace · Returns: { rows: Array<Record<string, unknown>> } shaped for the chart payload.",
  },
  {
    id: "tool-write_report",
    name: "write_report",
    purpose:
      "Finalize with markdown + an optional bar/line chart. The chart payload is JSON, rendered by Recharts.",
    args:
      "{ markdown: string (>=20 chars), chart?: { type: 'bar'|'line', title?, data: [{name, value}] } }",
    emits:
      "Trace + `report` SSE event. UI stores it and reveals the bottom drawer.",
  },
  {
    id: "tool-suggest_followups",
    name: "suggest_followups",
    purpose:
      "Two or three short contextual follow-ups the user might want next. Called at the end of every turn.",
    args:
      "{ prompts: Array<{ label, prompt }> } (min 2, max 3)",
    emits:
      "Trace + `suggestions` SSE event. UI renders fill-on-click chips under the latest assistant bubble.",
  },
];

const SSE_EVENTS = [
  {
    type: "trace",
    payload: "{ icon?, label, details? }",
    purpose: "One line in the chat sidebar — small pill, gerund tone.",
  },
  {
    type: "pipeline",
    payload: "{ ai: AIPipelineSchema }",
    purpose: "Replaces the canvas. UI re-layouts + executes via DuckDB.",
  },
  {
    type: "alternatives",
    payload: "{ items: Array<{ label, hint?, pipeline }> }",
    purpose: "Populates the Alt picker over the canvas.",
  },
  {
    type: "report",
    payload: "{ markdown: string, chart?: ChartSpec }",
    purpose: "Stored in state; auto-opens the report drawer.",
  },
  {
    type: "suggestions",
    payload: "{ chips: Array<{ label, prompt }> }",
    purpose: "Follow-up chips under the last assistant message.",
  },
  {
    type: "error",
    payload: "{ message: string }",
    purpose: "Red bubble in the chat sidebar.",
  },
  {
    type: "done",
    payload: "(none)",
    purpose: "Terminal frame; UI flips the busy flag off.",
  },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/60 via-white to-white text-slate-900">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-xs font-bold text-white">
            Q
          </span>
          <span className="text-sm font-semibold tracking-tight">
            Qwen Data Wrangler
          </span>
        </Link>
        <Link
          to="/app"
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-sm font-medium text-white transition-colors hover:bg-slate-800"
        >
          Launch app
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-10 pt-6">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs text-indigo-700">
          <BookOpen className="h-3 w-3" />
          Reference · MVP
        </div>
        <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          How it all fits together.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
          The agent is{" "}
          <a
            href="https://www.alibabacloud.com/help/en/model-studio/use-qwen-by-calling-api"
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 underline-offset-2 hover:underline"
          >
            Qwen via DashScope
          </a>{" "}
          driven by the{" "}
          <a
            href="https://ai-sdk.dev/docs"
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 underline-offset-2 hover:underline"
          >
            Vercel AI SDK
          </a>
          . The canvas is{" "}
          <a
            href="https://reactflow.dev"
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 underline-offset-2 hover:underline"
          >
            React Flow
          </a>
          . Real SQL runs in the browser via{" "}
          <a
            href="https://duckdb.org/docs/api/wasm/overview"
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 underline-offset-2 hover:underline"
          >
            DuckDB-WASM
          </a>
          . Pipelines persist in SQLite locally, ApsaraDB / PolarDB in prod.
        </p>
      </section>

      <div className="mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <nav
              aria-label="Documentation table of contents"
              className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto pb-8"
            >
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-600">
                On this page
              </div>
              <ul className="space-y-1 text-sm">
                {SECTIONS.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="block rounded-md px-2 py-1 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                    >
                      {s.label}
                    </a>
                  </li>
                ))}
                <li className="pt-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-600">
                    Tools
                  </div>
                </li>
                {TOOLS.map((t) => (
                  <li key={t.id}>
                    <a
                      href={`#${t.id}`}
                      className="block rounded-md px-2 py-1 font-mono text-xs text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                    >
                      {t.name}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <main className="min-w-0 pb-24">
            <Section id="architecture" icon={<Network className="h-5 w-5" />} title="Architecture">
              <p className="text-slate-600">
                Two control paths, one UI. <strong>Copilot</strong>
                {" "}(manual mode) is a single POST to{" "}
                <code className="font-mono">/api/generate-flow</code>: one
                pipeline returns, the UI runs it. <strong>Autopilot</strong>
                {" "}is a streaming POST to{" "}
                <code className="font-mono">/api/autopilot</code>: an agent loop
                inspects the schema, builds a pipeline (or several), analyzes
                the result, writes a report, and suggests follow-ups — emitting
                SSE events at each step.
              </p>
              <Diagram />
              <p className="text-slate-600">
                Persistence (pipeline metadata) and execution (user data
                transforms) are deliberately separate layers. SQLite holds
                pipeline JSON; DuckDB-WASM crunches CSVs. Both can be swapped
                independently for production (ApsaraDB / PolarDB for
                persistence; Function Compute + DuckDB / Hologres /
                AnalyticDB-PG for execution — see the{" "}
                <a
                  href="https://github.com/TLiu2014/qwen-data-wrangler/blob/main/docs/query-engine.md"
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-600 underline-offset-2 hover:underline"
                >
                  QueryEngine doc
                </a>
                ).
              </p>
            </Section>

            <Section id="endpoints" icon={<Layers className="h-5 w-5" />} title="HTTP endpoints">
              <Card>
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white">POST</span>
                  <code className="font-mono text-sm">/api/generate-flow</code>
                </div>
                <p className="text-sm text-slate-600">
                  Single-shot. Body:{" "}
                  <code className="font-mono">
                    {`{ prompt, tables?: TableDescriptor[] }`}
                  </code>
                  . Returns:{" "}
                  <code className="font-mono">{`{ pipelineId, ai: AIPipelineSchema }`}</code>
                  . The <code className="font-mono">tables</code> array carries
                  the live DuckDB schema (sample + uploaded CSVs) so the model
                  references real column names. Header{" "}
                  <code className="font-mono">x-dashscope-api-key</code>{" "}
                  overrides the server's <code className="font-mono">.env</code>.
                </p>
              </Card>
              <Card>
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white">POST</span>
                  <code className="font-mono text-sm">/api/autopilot</code>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600">
                    SSE
                  </span>
                </div>
                <p className="text-sm text-slate-600">
                  Streams Server-Sent Events as the agent works. Body matches
                  generate-flow ({" "}
                  <code className="font-mono">prompt</code>,{" "}
                  <code className="font-mono">tables?</code>). Response is{" "}
                  <code className="font-mono">text/event-stream</code> with
                  the events documented under{" "}
                  <a href="#sse" className="text-indigo-600 hover:underline">
                    SSE event protocol
                  </a>
                  .
                </p>
              </Card>
            </Section>

            <Section id="tools" icon={<Wrench className="h-5 w-5" />} title="Autopilot tools">
              <p className="text-slate-600">
                Six tools wired through{" "}
                <a
                  href="https://ai-sdk.dev/docs/foundations/tools"
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-600 underline-offset-2 hover:underline"
                >
                  Vercel AI SDK <code className="font-mono">tool()</code>
                </a>{" "}
                with zod input schemas. The agent calls them in the order
                listed; mismatched payloads are rejected by the SDK and the
                agent gets a chance to retry within{" "}
                <code className="font-mono">stepCountIs(8)</code>.
              </p>
              {TOOLS.map((t) => (
                <Card key={t.id} id={t.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <code className="rounded bg-indigo-50 px-2 py-0.5 font-mono text-sm font-semibold text-indigo-700">
                      {t.name}
                    </code>
                  </div>
                  <p className="text-sm text-slate-700">{t.purpose}</p>
                  <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-[80px_1fr]">
                    <dt className="font-semibold uppercase tracking-wider text-slate-500">
                      Input
                    </dt>
                    <dd>
                      <code className="font-mono text-slate-700">{t.args}</code>
                    </dd>
                    <dt className="font-semibold uppercase tracking-wider text-slate-500">
                      Effect
                    </dt>
                    <dd className="text-slate-600">{t.emits}</dd>
                  </dl>
                </Card>
              ))}
            </Section>

            <Section id="sse" icon={<GitBranch className="h-5 w-5" />} title="SSE event protocol">
              <p className="text-slate-600">
                Every frame is encoded as <code className="font-mono">data: &lt;json&gt;\n\n</code>
                . The client (<code className="font-mono">streamAutopilot</code>{" "}
                in <code className="font-mono">ui/src/lib/api.ts</code>) reads
                the body stream, splits on blank lines, parses each JSON
                payload, and dispatches into a callback.
              </p>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-semibold">type</th>
                      <th className="px-3 py-2 font-semibold">payload</th>
                      <th className="px-3 py-2 font-semibold">effect</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SSE_EVENTS.map((e) => (
                      <tr key={e.type} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <code className="font-mono text-xs font-semibold text-indigo-700">
                            {e.type}
                          </code>
                        </td>
                        <td className="px-3 py-2">
                          <code className="font-mono text-xs text-slate-600">
                            {e.payload}
                          </code>
                        </td>
                        <td className="px-3 py-2 text-slate-600">{e.purpose}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section id="query-engine" icon={<Database className="h-5 w-5" />} title="QueryEngine">
              <p className="text-slate-600">
                One interface, swappable backends. The active implementation is{" "}
                <code className="font-mono">BrowserDuckDBEngine</code>: DuckDB-WASM
                loads once on page open (preloaded in{" "}
                <code className="font-mono">main.tsx</code>), holds an{" "}
                <code className="font-mono">AsyncDuckDBConnection</code> for the
                lifetime of the tab, and materializes each pipeline stage as a{" "}
                <code className="font-mono">CREATE OR REPLACE VIEW</code> in
                topological order.
              </p>
              <p className="text-slate-600">
                Server-side candidates that plug into the same{" "}
                <code className="font-mono">QueryEngine</code> interface without
                changing the agent or the UI:
              </p>
              <ul className="ml-6 list-disc space-y-1.5 text-sm text-slate-700">
                <li>
                  <strong>Function Compute + OSS</strong> — same DuckDB engine
                  on serverless, scales beyond browser memory.
                </li>
                <li>
                  <strong>Hologres</strong> — Postgres-protocol MPP for
                  sub-second interactive analytics.
                </li>
                <li>
                  <strong>AnalyticDB for PostgreSQL</strong> — MPP OLAP with
                  full PG SQL surface.
                </li>
                <li>
                  <strong>MaxCompute</strong> — TB+ batch warehouse for
                  scheduled jobs.
                </li>
              </ul>
              <p className="text-slate-600">
                Full option tracker with SQL-dialect notes is in{" "}
                <a
                  href="https://github.com/TLiu2014/qwen-data-wrangler/blob/main/docs/query-engine.md"
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-600 underline-offset-2 hover:underline"
                >
                  docs/query-engine.md
                </a>
                .
              </p>
            </Section>

            <Section id="stack" icon={<ExternalLink className="h-5 w-5" />} title="Stack & resources">
              <ResourceGroup title="Qwen / DashScope">
                <Resource
                  href="https://www.alibabacloud.com/help/en/model-studio/use-qwen-by-calling-api"
                  label="OpenAI-compatible API guide"
                  hint="Endpoint + request shape used by both /generate-flow and /autopilot."
                />
                <Resource
                  href="https://dashscope-intl.console.aliyuncs.com/"
                  label="DashScope International console"
                  hint="API key management + free-quota tracking."
                />
                <Resource
                  href="https://www.alibabacloud.com/help/en/model-studio/models"
                  label="Model catalog"
                  hint="qwen-turbo (default), qwen-plus, qwen-max."
                />
              </ResourceGroup>

              <ResourceGroup title="Vercel AI SDK">
                <Resource
                  href="https://ai-sdk.dev/docs"
                  label="AI SDK docs"
                  hint="streamText, tool(), stepCountIs — used by autopilot."
                />
                <Resource
                  href="https://ai-sdk.dev/providers/ai-sdk-providers/openai"
                  label="@ai-sdk/openai provider"
                  hint="createOpenAI pointed at the DashScope-intl base URL."
                />
              </ResourceGroup>

              <ResourceGroup title="Alibaba Cloud (data layer)">
                <Resource
                  href="https://www.alibabacloud.com/help/en/rds/apsaradb-rds-for-postgresql"
                  label="ApsaraDB RDS for PostgreSQL"
                  hint="Persistent store option when NODE_ENV=production."
                />
                <Resource
                  href="https://www.alibabacloud.com/help/en/polardb/polardb-for-postgresql"
                  label="PolarDB for PostgreSQL"
                  hint="Alternative managed Postgres with HTAP support."
                />
                <Resource
                  href="https://www.alibabacloud.com/help/en/oss"
                  label="Object Storage Service (OSS)"
                  hint="Where uploaded CSVs would live in a Function Compute backend."
                />
                <Resource
                  href="https://www.alibabacloud.com/help/en/function-compute"
                  label="Function Compute"
                  hint="Serverless host for a future DuckDB-on-server QueryEngine."
                />
                <Resource
                  href="https://www.alibabacloud.com/help/en/hologres"
                  label="Hologres"
                  hint="Real-time MPP analytics, Postgres-protocol."
                />
                <Resource
                  href="https://www.alibabacloud.com/help/en/analyticdb"
                  label="AnalyticDB for PostgreSQL"
                  hint="MPP OLAP, full PG SQL."
                />
              </ResourceGroup>

              <ResourceGroup title="Frontend libraries">
                <Resource
                  href="https://duckdb.org/docs/api/wasm/overview"
                  label="DuckDB-WASM"
                  hint="Browser SQL engine — see BrowserDuckDBEngine."
                />
                <Resource
                  href="https://reactflow.dev"
                  label="React Flow"
                  hint="DAG renderer behind the pipeline canvas."
                />
                <Resource
                  href="https://recharts.org"
                  label="Recharts"
                  hint="Bar / line charts inside the report drawer."
                />
                <Resource
                  href="https://github.com/remarkjs/react-markdown"
                  label="react-markdown"
                  hint="Renders the agent's report markdown."
                />
              </ResourceGroup>
            </Section>
          </main>
        </div>
      </div>

      <footer className="mx-auto max-w-6xl px-6 pb-10 text-center text-xs text-slate-400">
        Qwen Cloud Hackathon · Track 4 · Autopilot Agent
      </footer>
    </div>
  );
}

function Section({
  id,
  icon,
  title,
  children,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 pb-14">
      <div className="mb-4 flex items-center gap-2 text-indigo-600">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">
          {title}
        </span>
      </div>
      <h2 className="mb-3 text-2xl font-bold tracking-tight text-slate-900">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Card({
  id,
  children,
}: {
  id?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      className="scroll-mt-20 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      {children}
    </div>
  );
}

function ResourceGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </h3>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</ul>
    </div>
  );
}

function Resource({
  href,
  label,
  hint,
}: {
  href: string;
  label: string;
  hint?: string;
}) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="group flex items-start gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 transition-colors hover:border-indigo-300 hover:bg-indigo-50"
      >
        <span className="flex-1">
          <span className="block text-sm font-medium text-slate-900 group-hover:text-indigo-700">
            {label}
          </span>
          {hint && (
            <span className="block text-xs text-slate-500">{hint}</span>
          )}
        </span>
        <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-indigo-500" />
      </a>
    </li>
  );
}

/** Plain ASCII-ish architecture sketch — kept simple so it stays readable. */
function Diagram() {
  return (
    <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-[11px] leading-relaxed text-slate-700">{`           ┌─────────── Browser tab ───────────┐
           │  React + React Flow pipeline UI   │
           │  ┌─────────────────────────────┐  │
           │  │  Chat sidebar  ⇄  Canvas    │  │
           │  │                  ⇅          │  │
           │  │              Results tabs   │  │
           │  │                  ⇅          │  │
           │  │              Report drawer  │  │
           │  └─────────────────────────────┘  │
           │           │            │           │
           │           │            ▼           │
           │           │      DuckDB-WASM      │
           │           │   (CREATE VIEW per     │
           │           │    pipeline stage)     │
           │           ▼                        │
           │   POST /api/generate-flow          │
           │   POST /api/autopilot (SSE)        │
           └────────────┬───────────────────────┘
                        │
            ┌───────────▼─────────────────┐
            │  Express + Vercel AI SDK    │
            │  → Qwen / DashScope intl    │
            │  → Drizzle + SQLite / PG    │
            └─────────────────────────────┘`}</pre>
  );
}
