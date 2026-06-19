import { cn } from "@/lib/utils";
import type { PipelineAlternative } from "@/lib/api";

export interface AlternativesPickerProps {
  alternatives: PipelineAlternative[];
  /** Index of the currently rendered alternative. */
  selectedIndex: number;
  onSelect: (index: number) => void;
}

/**
 * Small chip row that hovers in the top-left of the canvas when the agent
 * emitted multiple pipelines via `propose_alternatives`. Each chip swaps the
 * rendered schema + re-runs DuckDB against the chosen alt.
 *
 * Hidden when there's only one alternative — no point showing a picker.
 */
export function AlternativesPicker({
  alternatives,
  selectedIndex,
  onSelect,
}: AlternativesPickerProps) {
  if (alternatives.length < 2) return null;
  return (
    <div className="pointer-events-auto absolute left-2 top-2 z-20 flex max-w-[min(100%-1rem,32rem)] flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 px-2 py-1.5 shadow-md backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        Alternatives
      </span>
      {alternatives.map((a, i) => {
        const active = i === selectedIndex;
        return (
          <button
            key={`${a.label}-${i}`}
            type="button"
            onClick={() => onSelect(i)}
            title={a.hint ?? a.label}
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
              active
                ? "border-indigo-500 bg-indigo-500 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-800",
            )}
          >
            <span className="opacity-60">Alt {i + 1}</span>
            <span className="ml-1">·</span>
            <span className="ml-1 truncate max-w-[10rem]">{a.label}</span>
          </button>
        );
      })}
    </div>
  );
}
