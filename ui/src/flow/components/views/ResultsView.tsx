import { useEffect, useMemo, useState } from "react";
import type { PipelineSchema } from "@flow/Schema";
import { getStageColor } from "@flow/types/Pipeline";
import {
  DataTableView,
  type DataTableColumn,
} from "./DataTableView";

export interface StageResult {
  columns: DataTableColumn[];
  rows: Array<Record<string, unknown>>;
}

export interface ResultsViewProps {
  schema: PipelineSchema;
  /**
   * Per-stage result data, keyed by stage.id. Stages without an entry render
   * an empty-state body. The library never executes anything — the host fills
   * this map from its own engine / backend / fixture.
   */
  results: Record<string, StageResult>;
  /** Active tab. Omit to let the component manage its own state. */
  activeStageId?: string | null;
  onActiveStageIdChange?: (stageId: string) => void;
  /** Message shown for stages with no result data yet. */
  emptyMessage?: string;
}

/**
 * Tab strip per pipeline stage with row data shown via DataTableView.
 * Mirrors the visual of DataSchemaView so the two views feel uniform when
 * placed side-by-side.
 */
export function ResultsView({
  schema,
  results,
  activeStageId,
  onActiveStageIdChange,
  emptyMessage,
}: ResultsViewProps) {
  const isControlled = activeStageId !== undefined;
  const [internalActiveId, setInternalActiveId] = useState<string | null>(
    schema.stages[0]?.id ?? null,
  );

  const [tabOrder, setTabOrder] = useState<string[]>(() =>
    schema.stages.map((s) => s.id),
  );

  useEffect(() => {
    const schemaIds = new Set(schema.stages.map((s) => s.id));
    setTabOrder((prev) => {
      const kept = prev.filter((id) => schemaIds.has(id));
      const keptSet = new Set(kept);
      const newIds = schema.stages.map((s) => s.id).filter((id) => !keptSet.has(id));
      if (newIds.length === 0 && kept.length === prev.length) return prev;
      return [...kept, ...newIds];
    });
  }, [schema.stages]);

  useEffect(() => {
    if (isControlled) return;
    if (internalActiveId && tabOrder.includes(internalActiveId)) return;
    setInternalActiveId(tabOrder[0] ?? null);
  }, [tabOrder, internalActiveId, isControlled]);

  const activeId = isControlled ? activeStageId : internalActiveId;

  const handleActiveChange = (id: string) => {
    if (!isControlled) setInternalActiveId(id);
    onActiveStageIdChange?.(id);
  };

  const stageById = useMemo(
    () => new Map(schema.stages.map((s) => [s.id, s])),
    [schema.stages],
  );
  const orderedStages = useMemo(
    () => tabOrder.map((id) => stageById.get(id)).filter(Boolean) as typeof schema.stages,
    [tabOrder, stageById],
  );

  if (orderedStages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">
        No stages yet. Add a stage on the canvas to see its result data here.
      </div>
    );
  }

  const activeStage = orderedStages.find((s) => s.id === activeId);
  const activeResult = activeId ? results[activeId] : undefined;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 items-center gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2">
        {orderedStages.map((s) => {
          const isActive = s.id === activeId;
          const r = results[s.id];
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => handleActiveChange(s.id)}
              className={
                "inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-1.5 text-sm font-medium transition-colors " +
                (isActive
                  ? "border-blue-500 text-gray-900 dark:text-gray-100"
                  : "border-transparent text-gray-600 dark:text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-100")
              }
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: getStageColor({ stageType: s.type, color: s.color }) }}
              />
              <span className="font-mono text-xs">{s.output}</span>
              {r && (
                <span className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-px text-[10px] font-medium text-gray-600 dark:text-gray-400 dark:text-gray-500">
                  {r.rows.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-hidden">
        {activeStage && activeResult ? (
          <DataTableView
            columns={activeResult.columns}
            rows={activeResult.rows}
            caption={activeStage.output}
            emptyMessage={emptyMessage ?? "No rows."}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">
            {emptyMessage ??
              "No result data for this stage yet. The host populates rows when its engine runs the pipeline."}
          </div>
        )}
      </div>
    </div>
  );
}
