import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@flow/components/ui/Button";
import { Label } from "@flow/components/ui/Label";
import { cn } from "@flow/lib/Utils";
import {
  type StageConfig,
  type StageNodeData,
  STAGE_COLORS,
  STAGE_LABELS,
  describeStageOperation,
} from "@flow/types/Pipeline";

interface StageDetailsViewProps {
  node: { id: string; data: StageNodeData } | null;
  /** Called when the user dismisses the panel (X / footer Close / Esc). */
  onClose?: () => void;
}

/**
 * Read-only inspector for a stage. Mirrors StageConfigUI's structure so the
 * view-only experience feels symmetric with editing, but renders every value
 * as plain text instead of input controls.
 */
export function StageDetailsView({ node, onClose }: StageDetailsViewProps) {
  // Esc closes the panel — symmetric with the editor's Esc-to-cancel.
  useEffect(() => {
    if (!node) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [node, onClose]);

  if (!node) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-sm text-gray-500 dark:text-gray-400">
        Select a node on the canvas to inspect it.
      </div>
    );
  }

  const { data } = node;
  const displayType = data.displayType?.trim() ?? "";
  const defaultColor = STAGE_COLORS[data.stageType];
  const effectiveColor = data.color ?? defaultColor;
  const usingCustomColor = data.color != null && data.color !== defaultColor;

  return (
    <div className="grid h-full min-h-0 w-full flex-1 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded px-2 py-0.5 text-xs font-semibold tracking-wide text-white",
              !displayType && "uppercase",
            )}
            style={{ backgroundColor: effectiveColor }}
          >
            {displayType || STAGE_LABELS[data.stageType]}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            #{data.stageIndex}
          </span>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close details"
          >
            <X className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          </Button>
        )}
      </header>

      <div className="min-h-0 overflow-y-auto overscroll-contain p-4">
        <div className="space-y-4">
          <DetailRow label="Display label" value={data.label} />
          {displayType && (
            <DetailRow label="Display type name" value={displayType} />
          )}
          <DetailRow
            label="Output table name"
            value={data.outputTableName ?? `${data.stageType.toLowerCase()}_${data.stageIndex}`}
            mono
          />
          <DetailRow
            label="Color"
            value={
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-4 w-4 rounded-full border border-black/10"
                  style={{ backgroundColor: effectiveColor }}
                />
                <span className="font-mono text-xs text-gray-700 dark:text-gray-300">
                  {effectiveColor}
                </span>
                {!usingCustomColor && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    (default for {data.stageType})
                  </span>
                )}
              </div>
            }
          />

          <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
            <DetailRow
              label="Operation"
              value={
                <span className="font-mono text-[11px] text-gray-700 dark:text-gray-300">
                  {describeStageOperation(data.config)}
                </span>
              }
            />
            <div className="mt-3">
              <OperationDetails config={data.config} />
            </div>
          </div>
        </div>
      </div>

      {onClose && (
        <footer className="border-t border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="w-full justify-center"
          >
            Close
          </Button>
        </footer>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div
        className={cn(
          "min-h-[20px] text-sm text-gray-800 dark:text-gray-200",
          mono && "font-mono",
        )}
      >
        {value === "" || value == null ? (
          <span className="text-gray-400 dark:text-gray-500">—</span>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

function Tags({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <span className="text-gray-400 dark:text-gray-500">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((it) => (
        <span
          key={it}
          className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300"
        >
          {it}
        </span>
      ))}
    </div>
  );
}

function SubTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  if (rows.length === 0) {
    return <span className="text-gray-400 dark:text-gray-500">—</span>;
  }
  return (
    <div className="overflow-hidden rounded border border-gray-200 dark:border-gray-700">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="px-2 py-1 text-left font-medium text-gray-600 dark:text-gray-400"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-t border-gray-200 dark:border-gray-700"
            >
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="px-2 py-1 font-mono text-gray-700 dark:text-gray-300"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OperationDetails({ config }: { config: StageConfig }) {
  switch (config.stageType) {
    case "LOAD":
      return (
        <div className="space-y-3">
          <DetailRow label="Table name" value={config.tableName} mono />
          <DetailRow label="Source" value={config.source ?? ""} mono />
        </div>
      );
    case "FILTER":
      return (
        <div className="space-y-3">
          <DetailRow label="Source table" value={config.table} mono />
          <DetailRow label="Column" value={config.column} mono />
          <DetailRow label="Operator" value={config.operator} mono />
          <DetailRow label="Value" value={config.value} mono />
        </div>
      );
    case "JOIN":
      return (
        <div className="space-y-3">
          <DetailRow label="Join type" value={config.joinType} mono />
          <div className="grid grid-cols-2 gap-3">
            <DetailRow label="Left table" value={config.leftTable} mono />
            <DetailRow label="Left key" value={config.leftKey} mono />
            <DetailRow label="Right table" value={config.rightTable} mono />
            <DetailRow label="Right key" value={config.rightKey} mono />
          </div>
        </div>
      );
    case "UNION":
      return (
        <div className="space-y-3">
          <DetailRow label="Tables" value={<Tags items={config.tables} />} />
          <DetailRow
            label="Mode"
            value={config.unionAll ? "UNION ALL (keep duplicates)" : "UNION (de-duplicate)"}
          />
        </div>
      );
    case "GROUP":
      return (
        <div className="space-y-3">
          <DetailRow label="Source table" value={config.table} mono />
          <DetailRow
            label="Group by"
            value={<Tags items={config.groupBy} />}
          />
          <DetailRow
            label="Aggregations"
            value={
              <SubTable
                headers={["Function", "Column", "Output name"]}
                rows={config.aggregations.map((a) => [a.fn, a.column, a.alias])}
              />
            }
          />
        </div>
      );
    case "SORT":
      return (
        <div className="space-y-3">
          <DetailRow label="Source table" value={config.table} mono />
          <DetailRow
            label="Order by"
            value={
              <SubTable
                headers={["Column", "Direction"]}
                rows={config.orderBy.map((o) => [o.column, o.direction])}
              />
            }
          />
        </div>
      );
    case "SELECT":
      return (
        <div className="space-y-3">
          <DetailRow label="Source table" value={config.table} mono />
          <DetailRow
            label="Columns"
            value={<Tags items={config.columns} />}
          />
        </div>
      );
    case "PIVOT":
      return (
        <div className="space-y-3">
          <DetailRow label="Source table" value={config.table} mono />
          <DetailRow label="Index column" value={config.indexColumn} mono />
          <DetailRow label="Columns column" value={config.columnsColumn} mono />
          <DetailRow label="Values column" value={config.valuesColumn} mono />
          <DetailRow label="Aggregation" value={config.aggregation} mono />
        </div>
      );
    case "UNPIVOT":
      return (
        <div className="space-y-3">
          <DetailRow label="Source table" value={config.table} mono />
          <DetailRow
            label="Identifier columns"
            value={<Tags items={config.idColumns} />}
          />
          <DetailRow
            label="Value columns"
            value={<Tags items={config.valueColumns} />}
          />
          <div className="grid grid-cols-2 gap-3">
            <DetailRow label="Output name column" value={config.nameColumn} mono />
            <DetailRow label="Output value column" value={config.valueColumn} mono />
          </div>
        </div>
      );
    case "DEDUPE":
      return (
        <div className="space-y-3">
          <DetailRow label="Source table" value={config.table} mono />
          <DetailRow
            label="Key columns"
            value={
              config.keyColumns.length
                ? <Tags items={config.keyColumns} />
                : "All columns"
            }
          />
          <DetailRow
            label="Keep by"
            value={
              config.keepBy?.column
                ? `${config.keepBy.column} (${config.keepBy.direction})`
                : "Any duplicate"
            }
            mono={!!config.keepBy?.column}
          />
        </div>
      );
    case "VALIDATE":
      return (
        <div className="space-y-3">
          <DetailRow label="Source table" value={config.table} mono />
          <DetailRow label="Combinator" value={config.combinator} mono />
          <DetailRow
            label="Rules"
            value={
              <SubTable
                headers={["Column", "Operator", "Value"]}
                rows={config.rules.map((r) => [r.column, r.operator, r.value])}
              />
            }
          />
          <div className="grid grid-cols-2 gap-3">
            <DetailRow label="Pass output" value={config.passOutput} mono />
            <DetailRow label="Fail output" value={config.failOutput} mono />
          </div>
        </div>
      );
    case "LOOKUP":
      return (
        <div className="space-y-3">
          <DetailRow label="Source table" value={config.table} mono />
          <DetailRow label="Target column" value={config.targetColumn} mono />
          <DetailRow
            label="Output"
            value={
              config.outputType === "NEW_COLUMN"
                ? `New column: ${config.newColumnName || "(unnamed)"}`
                : "Overwrite existing column"
            }
            mono={config.outputType === "NEW_COLUMN" && !!config.newColumnName}
          />
          <DetailRow
            label="Fallback"
            value={config.fallbackValue || "(NULL)"}
            mono={!!config.fallbackValue}
          />
          <DetailRow
            label="Dictionary"
            value={
              <SubTable
                headers={["Source", "Target"]}
                rows={config.dictionary.map((e) => [e.source, e.target])}
              />
            }
          />
        </div>
      );
    case "FORMULA":
      return (
        <div className="space-y-3">
          <DetailRow label="Source table" value={config.table} mono />
          <DetailRow
            label="Expressions"
            value={
              config.expressions.length === 0 ? (
                <span className="text-gray-400 dark:text-gray-500">—</span>
              ) : (
                <div className="space-y-2">
                  {config.expressions.map((e, i) => (
                    <div
                      key={i}
                      className="rounded border border-gray-200 p-2 text-xs dark:border-gray-700"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-gray-900 dark:text-gray-100">
                          {e.outputColumn || "(unnamed)"}
                        </span>
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                          {e.category}
                        </span>
                      </div>
                      <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] text-gray-700 dark:text-gray-300">
                        {e.expression || "—"}
                      </pre>
                    </div>
                  ))}
                </div>
              )
            }
          />
        </div>
      );
    case "WINDOW":
      return (
        <div className="space-y-3">
          <DetailRow label="Source table" value={config.table} mono />
          <DetailRow
            label="Partition by"
            value={<Tags items={config.partitionBy} />}
          />
          <DetailRow
            label="Order by"
            value={
              <SubTable
                headers={["Column", "Direction"]}
                rows={config.orderBy.map((o) => [o.column, o.direction])}
              />
            }
          />
          <DetailRow
            label="Operations"
            value={
              <SubTable
                headers={["Function", "Target", "Output name"]}
                rows={config.operations.map((o) => [
                  o.fn,
                  o.targetColumn ?? "—",
                  o.outputName,
                ])}
              />
            }
          />
        </div>
      );
    case "CUSTOM":
      return (
        <DetailRow
          label="SQL"
          value={
            <pre className="max-h-64 overflow-auto rounded border border-gray-200 bg-gray-50 p-2 font-mono text-[11px] text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
              {config.sql || "—"}
            </pre>
          }
        />
      );
  }
}
