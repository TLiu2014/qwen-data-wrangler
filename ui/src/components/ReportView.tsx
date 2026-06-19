import ReactMarkdown from "react-markdown";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSpec } from "@/lib/api";

export interface ReportViewProps {
  markdown: string;
  chart?: ChartSpec;
}

/**
 * Markdown report rendered above a Recharts bar/line chart. Both pieces are
 * what the autopilot agent emits in its `write_report` tool call; the host
 * is responsible for showing/hiding this whole panel.
 */
export function ReportView({ markdown, chart }: ReportViewProps) {
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <article className="prose prose-sm prose-slate max-w-none dark:prose-invert">
        <ReactMarkdown>{markdown}</ReactMarkdown>
      </article>
      {chart && chart.data.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          {chart.title && (
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {chart.title}
            </h4>
          )}
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {chart.type === "line" ? (
                <LineChart
                  data={chart.data}
                  margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" fontSize={11} stroke="#94a3b8" />
                  <YAxis fontSize={11} stroke="#94a3b8" />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              ) : (
                <BarChart
                  data={chart.data}
                  margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" fontSize={11} stroke="#94a3b8" />
                  <YAxis fontSize={11} stroke="#94a3b8" />
                  <Tooltip />
                  <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
