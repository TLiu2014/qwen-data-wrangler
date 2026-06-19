import { useEffect, useMemo, useState } from "react";
import {
  inferOutputSchemas,
  type StageOutputSchema,
} from "@flow/Schema";
import type { PipelineSchema } from "@flow/Schema";
import { describeStageOperation, getStageColor } from "@flow/types/Pipeline";

export interface DataSchemaViewProps {
  schema: PipelineSchema;
  /** Active tab. Omit to let the component manage its own state. */
  activeStageId?: string | null;
  onActiveStageIdChange?: (stageId: string) => void;
}

export function DataSchemaView({
  schema,
  activeStageId,
  onActiveStageIdChange,
}: DataSchemaViewProps) {
  const isControlled = activeStageId !== undefined;
  const [internalActiveId, setInternalActiveId] = useState<string | null>(
    schema.stages[0]?.id ?? null,
  );

  // Stable tab order: new stages append at end, deleted stages removed,
  // existing stages never reorder (survives topology changes and orphaning).
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

  // Keep internal active id valid when tab order changes.
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

  const inferences = useMemo(() => inferOutputSchemas(schema), [schema]);
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
        No stages yet. Add a stage on the canvas, or load a pipeline JSON to
        see its data schema.
      </div>
    );
  }

  const activeInf = activeId ? inferences.get(activeId) : null;
  const activeStage = orderedStages.find((s) => s.id === activeId);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 items-center gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2">
        {orderedStages.map((s) => {
          const isActive = s.id === activeId;
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
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-auto">
        {activeInf && activeStage ? (
          <SchemaPanel
            inference={activeInf}
            operationLabel={describeStageOperation(activeStage.operation)}
            stageType={activeStage.type}
            inputs={activeStage.inputs}
          />
        ) : null}
      </div>
    </div>
  );
}

interface SchemaPanelProps {
  inference: StageOutputSchema;
  operationLabel: string;
  stageType: string;
  inputs: string[];
}

function SchemaPanel({
  inference,
  operationLabel,
  stageType,
  inputs,
}: SchemaPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-gray-200 dark:border-gray-700 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:text-gray-400 dark:text-gray-500">
        <span>
          <span className="font-mono text-gray-900 dark:text-gray-100">{inference.output}</span>
          {inference.inferred ? (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
              inferred
            </span>
          ) : (
            <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
              source
            </span>
          )}
        </span>
        {inputs.length > 0 && (
          <span>
            inputs:{" "}
            <span className="font-mono">{inputs.join(", ") || "—"}</span>
          </span>
        )}
        <span className="text-gray-500 dark:text-gray-400 dark:text-gray-500">{operationLabel}</span>
      </header>

      {inference.unknown ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">
            {stageType === "CUSTOM"
              ? "Custom SQL — output schema is determined at runtime."
              : "Schema could not be inferred."}
          </p>
          {stageType === "CUSTOM" && (
            <p className="max-w-xs text-xs text-gray-400 dark:text-gray-500">
              This is a UI-only module. No SQL is executed here. The host
              application is responsible for running the transformation and
              providing results.
            </p>
          )}
        </div>
      ) : inference.columns.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">
          No columns. Configure the stage's source table.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white dark:bg-gray-900">
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="h-9 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 dark:text-gray-500">
                #
              </th>
              <th className="h-9 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 dark:text-gray-500">
                Column
              </th>
              <th className="h-9 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 dark:text-gray-500">
                Type
              </th>
              <th className="h-9 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 dark:text-gray-500">
                Source
              </th>
            </tr>
          </thead>
          <tbody>
            {inference.columns.map((c, i) => (
              <tr
                key={`${c.name}-${i}`}
                className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/60"
              >
                <td className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500">{i + 1}</td>
                <td className="px-3 py-1.5 font-mono text-xs text-gray-900 dark:text-gray-100">
                  {c.name}
                </td>
                <td className="px-3 py-1.5">
                  <span className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 font-mono text-[11px] text-gray-700 dark:text-gray-300">
                    {c.type}
                  </span>
                </td>
                <td className="px-3 py-1.5 font-mono text-[11px] text-gray-500 dark:text-gray-400 dark:text-gray-500">
                  {c.source ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

