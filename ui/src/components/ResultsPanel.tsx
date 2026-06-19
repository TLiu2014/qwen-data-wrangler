import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import { ResultsView, type PipelineSchema, type StageResult } from "@flow";
import { ReportView } from "@/components/ReportView";
import type { ChartSpec } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface ResultsPanelProps {
  schema: PipelineSchema | null;
  results: Record<string, StageResult>;
  /** Controlled active tab (set by the canvas via onShowOutput). */
  activeStageId: string | null;
  onActiveStageIdChange: (stageId: string) => void;
  /** Optional report emitted by the autopilot agent. */
  report: { markdown: string; chart?: ChartSpec } | null;
  /** Whether the bottom report drawer is visible. */
  showReport: boolean;
  onShowReportChange: (show: boolean) => void;
}

/**
 * Tabbed result tables (top) + optional report drawer (bottom). The drawer
 * is hidden by default and only available when a report exists — the user
 * toggles it via the "Show report" button in the header.
 */
export function ResultsPanel({
  schema,
  results,
  activeStageId,
  onActiveStageIdChange,
  report,
  showReport,
  onShowReportChange,
}: ResultsPanelProps) {
  const hasReport = !!report;
  const reportOpen = hasReport && showReport;

  return (
    <div className="flex h-full flex-col bg-white dark:bg-slate-950">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-700 dark:text-slate-200">
            Results
          </span>
          <span className="text-slate-400 dark:text-slate-500">
            ·{" "}
            {schema?.stages.length
              ? `${schema.stages.length} stage${
                  schema.stages.length === 1 ? "" : "s"
                }`
              : "no pipeline yet"}
          </span>
        </div>
        {hasReport && (
          <button
            type="button"
            onClick={() => onShowReportChange(!showReport)}
            title={showReport ? "Hide report" : "Show report"}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 normal-case tracking-normal transition-colors hover:bg-white hover:text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <FileText className="h-3 w-3" />
            {showReport ? "Hide report" : "Show report"}
            {showReport ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronUp className="h-3 w-3" />
            )}
          </button>
        )}
      </div>

      <div
        className={cn(
          "min-h-0 overflow-hidden",
          // When the report drawer is closed, results take the full panel.
          // When open, results take 60% and the drawer takes 40%.
          reportOpen ? "flex-[6]" : "flex-1",
        )}
      >
        {schema ? (
          <ResultsView
            schema={schema}
            results={results}
            activeStageId={activeStageId}
            onActiveStageIdChange={onActiveStageIdChange}
            emptyMessage="No rows for this stage. Manual mode renders the pipeline but doesn't execute SQL — switch to Autopilot mode for actual analysis tables, or load a sample from Settings."
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400 dark:text-slate-500">
            Output rows from the SQL transformations will show here.
          </div>
        )}
      </div>

      {reportOpen && report && (
        <div className="flex min-h-0 flex-[4] flex-col border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex h-7 shrink-0 items-center border-b border-slate-200 bg-white px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
            Report
          </div>
          <div className="min-h-0 flex-1 bg-white dark:bg-slate-950">
            <ReportView markdown={report.markdown} chart={report.chart} />
          </div>
        </div>
      )}
    </div>
  );
}
