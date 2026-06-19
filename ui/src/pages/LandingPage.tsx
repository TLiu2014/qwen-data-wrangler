import { Link } from "react-router-dom";
import {
  ArrowRight,
  GitBranch,
  MessageSquare,
  Table,
} from "lucide-react";

const FEATURES = [
  {
    icon: MessageSquare,
    title: "Chat-driven generation",
    body: "Describe a transformation in plain English. Qwen returns a typed pipeline schema we render straight onto the canvas.",
  },
  {
    icon: GitBranch,
    title: "Read-only React Flow canvas",
    body: "Pipelines render as a top-down DAG on React Flow — pan, zoom, click a node for stage details.",
  },
  {
    icon: Table,
    title: "Tabbed result tables",
    body: "Every stage gets its own tab. Sample rows are precomputed so the join, filter, and group outputs show real data.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/60 via-white to-white text-slate-900">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-xs font-bold text-white">
            Q
          </span>
          <span className="text-sm font-semibold tracking-tight">
            Qwen Data Wrangler
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/docs"
            className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-slate-700 transition-colors hover:text-slate-900"
          >
            Docs
          </Link>
          <Link
            to="/app"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:text-slate-900"
          >
            Launch app
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-12 pt-16 text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-indigo-600">
          Qwen Cloud Hackathon · Track 4
        </p>
        <h1 className="text-balance text-5xl font-bold tracking-tight text-slate-900 sm:text-6xl">
          Autopilot agent for SQL pipelines.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-slate-600">
          Chat your way to a typed data-transformation pipeline. Qwen plans
          the stages, the canvas renders them, and per-stage result tables
          show what every step does to your data.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            to="/app"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-900 px-5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            Open the app
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="https://github.com/TLiu2014/qwen-data-wrangler"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center rounded-md border border-slate-300 px-5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:text-slate-900"
          >
            Source on GitHub
          </a>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-16 sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-700">
              <Icon className="h-4 w-4" />
            </span>
            <h3 className="mt-4 text-base font-semibold text-slate-900">
              {title}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
              {body}
            </p>
          </div>
        ))}
      </section>

      <footer className="mx-auto max-w-5xl px-6 pb-10 text-center text-xs text-slate-400">
        Powered by{" "}
        <a
          href="https://dashscope-intl.aliyuncs.com"
          target="_blank"
          rel="noreferrer"
          className="underline-offset-2 hover:underline"
        >
          Qwen via DashScope
        </a>
        ,{" "}
        <a
          href="https://reactflow.dev"
          target="_blank"
          rel="noreferrer"
          className="underline-offset-2 hover:underline"
        >
          React Flow
        </a>
        , and{" "}
        <a
          href="https://duckdb.org/docs/api/wasm/overview"
          target="_blank"
          rel="noreferrer"
          className="underline-offset-2 hover:underline"
        >
          DuckDB-WASM
        </a>
        .
      </footer>
    </div>
  );
}
