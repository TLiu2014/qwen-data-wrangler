import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";
import type { InferredColumn, UpstreamColumnsLookup } from "@flow/Schema";
import { Button } from "@flow/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@flow/components/ui/Dialog";
import { Input } from "@flow/components/ui/Input";
import { Label } from "@flow/components/ui/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@flow/components/ui/Select";
import {
  type StageConfig,
  type StageNodeData,
  type AggregateFn,
  type FilterOperator,
  type FormulaCategory,
  type GroupAggregation,
  type JoinType,
  type LookupEntry,
  type LookupOutputMode,
  type SortDirection,
  type ValidateRule,
  type WindowFn,
  type WindowOperationEntry,
  type FormulaExpressionEntry,
  WINDOW_FNS_WITHOUT_TARGET,
  STAGE_COLORS,
  STAGE_LABELS,
  TAG_COLORS,
} from "@flow/types/Pipeline";
import { cn } from "@flow/lib/Utils";

interface StageConfigUIProps {
  node: { id: string; data: StageNodeData } | null;
  onUpdate: (id: string, patch: Partial<StageNodeData>) => void;
  onDelete: (id: string) => void;
  /**
   * Optional explicit-close handler. When provided, the form renders a
   * "Cancel" button next to "Save". The host decides what cancel means —
   * typically clearing the editing-node state (which dismisses the popover
   * or empties the right panel). Unsaved local edits are dropped on close.
   */
  onCancel?: () => void;
  /** When true (default), delete opens a confirmation dialog first. */
  confirmBeforeDelete?: boolean;
  /**
   * Resolve a table name → its inferred columns. When provided, column-name
   * inputs render as autocomplete dropdowns of upstream columns (with typed
   * free-text still accepted as a fallback for not-yet-declared names).
   */
  columnsLookup?: UpstreamColumnsLookup;
}

export function StageConfigUI({
  node,
  onUpdate,
  onDelete,
  onCancel,
  confirmBeforeDelete = true,
  columnsLookup,
}: StageConfigUIProps) {
  if (!node) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">
        Select a node on the canvas to configure it.
      </div>
    );
  }

  return (
    <StageConfigForm
      key={node.id}
      node={node}
      onUpdate={onUpdate}
      onDelete={onDelete}
      onCancel={onCancel}
      confirmBeforeDelete={confirmBeforeDelete}
      columnsLookup={columnsLookup}
    />
  );
}

interface StageConfigFormProps {
  node: { id: string; data: StageNodeData };
  onUpdate: (id: string, patch: Partial<StageNodeData>) => void;
  onDelete: (id: string) => void;
  onCancel?: () => void;
  confirmBeforeDelete: boolean;
  columnsLookup?: UpstreamColumnsLookup;
}

function StageConfigForm({
  node,
  onUpdate,
  onDelete,
  onCancel,
  confirmBeforeDelete,
  columnsLookup,
}: StageConfigFormProps) {
  const [label, setLabel] = useState(node.data.label);
  const [config, setConfig] = useState<StageConfig>(node.data.config);
  const [outputTableName, setOutputTableName] = useState(
    node.data.outputTableName ?? "",
  );
  const [color, setColor] = useState<string | undefined>(node.data.color);
  const [displayTypeInput, setDisplayTypeInput] = useState(node.data.displayType ?? "");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Color is live-previewed on the canvas: each pick calls onUpdate immediately
  // so the node re-paints. On Save we keep it; on Cancel/unmount we revert to
  // the color the node had when this form opened.
  const initialColorRef = useRef(node.data.color);
  const savedRef = useRef(false);
  const nodeIdRef = useRef(node.id);
  const onUpdateRef = useRef(onUpdate);
  nodeIdRef.current = node.id;
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    setLabel(node.data.label);
    setConfig(node.data.config);
    setOutputTableName(node.data.outputTableName ?? "");
    setColor(node.data.color);
    setDisplayTypeInput(node.data.displayType ?? "");
    initialColorRef.current = node.data.color;
    savedRef.current = false;
    // Intentionally key only on node.id: live-preview updates to node.data.color
    // would otherwise overwrite the baseline we need for revert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  // Revert preview color on unmount unless a save (or delete) committed it.
  useEffect(() => {
    return () => {
      if (savedRef.current) return;
      onUpdateRef.current(nodeIdRef.current, { color: initialColorRef.current });
    };
  }, []);

  const previewColor = (next: string | undefined) => {
    setColor(next);
    onUpdate(node.id, { color: next });
  };

  const defaultColor = STAGE_COLORS[node.data.stageType];
  const effectiveColor = color ?? defaultColor;
  const displayType = displayTypeInput.trim();

  const isDirty = useMemo(() => {
    if (label !== node.data.label) return true;
    const cleanOutput = outputTableName || undefined;
    if (cleanOutput !== node.data.outputTableName) return true;
    if (color !== node.data.color) return true;
    const cleanDisplayType = displayType || undefined;
    if (cleanDisplayType !== node.data.displayType) return true;
    // Config is a small POJO union — JSON-string compare is fine.
    if (JSON.stringify(config) !== JSON.stringify(node.data.config)) return true;
    return false;
  }, [
    label,
    outputTableName,
    config,
    color,
    displayType,
    node.data.label,
    node.data.outputTableName,
    node.data.config,
    node.data.color,
    node.data.displayType,
  ]);

  const handleSave = () => {
    savedRef.current = true;
    if (isDirty) {
      onUpdate(node.id, {
        label,
        config,
        outputTableName: outputTableName || undefined,
        color,
        displayType: displayType || undefined,
      });
    }
    onCancel?.();
  };

  const requestDelete = () => {
    if (!confirmBeforeDelete) {
      onDelete(node.id);
      return;
    }
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    savedRef.current = true;
    setDeleteDialogOpen(false);
    onDelete(node.id);
  };

  // Keep latest handlers reachable from the document-level keydown listener
  // without re-binding on every render.
  const handleSaveRef = useRef(handleSave);
  const onCancelRef = useRef(onCancel);
  const deleteDialogOpenRef = useRef(deleteDialogOpen);
  handleSaveRef.current = handleSave;
  onCancelRef.current = onCancel;
  deleteDialogOpenRef.current = deleteDialogOpen;

  // Document-level so shortcuts fire even when focus lands on body (e.g. after
  // clicking a color swatch in browsers that don't focus buttons on click).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (deleteDialogOpenRef.current) return;
      const t = e.target as HTMLElement | null;

      if (e.key === "Escape") {
        e.preventDefault();
        onCancelRef.current?.();
        return;
      }

      if (
        e.key === "Enter" &&
        !e.shiftKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        if (e.isComposing) return;
        // Let the focused element keep its own Enter behavior in these cases:
        // - textarea (newline)
        // - Radix Select trigger / listbox items (open/select)
        // - any button opting out via data attribute (Cancel, Delete)
        if (t?.tagName === "TEXTAREA") return;
        const role = t?.getAttribute("role");
        if (role === "combobox" || role === "listbox" || role === "option") return;
        if (t?.closest("[data-tfu-no-enter-save]")) return;
        e.preventDefault();
        handleSaveRef.current();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <div
      className="grid h-full min-h-0 w-full flex-1 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden"
    >
      <header className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded px-2 py-0.5 text-xs font-semibold tracking-wide text-white",
              !displayType && "uppercase",
            )}
            style={{ backgroundColor: effectiveColor }}
          >
            {displayType || STAGE_LABELS[node.data.stageType]}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500">#{node.data.stageIndex}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={requestDelete}
          aria-label="Delete stage"
          data-tfu-no-enter-save
        >
          <Trash2 className="h-4 w-4 text-gray-500 dark:text-gray-400 dark:text-gray-500" />
        </Button>
      </header>

      <div className="min-h-0 overflow-y-auto overscroll-contain p-4">
        <div className="space-y-4">
          <Field label="Display label">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Filter US customers"
            />
          </Field>

          <Field label="Display type name">
            <Input
              value={displayTypeInput}
              onChange={(e) => setDisplayTypeInput(e.target.value)}
              placeholder={`default: ${node.data.stageType}`}
            />
          </Field>

          <Field label="Output table name">
            <Input
              value={outputTableName}
              onChange={(e) => setOutputTableName(e.target.value)}
              placeholder="auto-generated if blank"
            />
          </Field>

          <Field label="Color">
            <ColorPicker
              value={color}
              defaultColor={defaultColor}
              onChange={previewColor}
            />
          </Field>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <ConfigFields
              config={config}
              onChange={setConfig}
              columnsLookup={columnsLookup}
            />
          </div>
        </div>
      </div>

      <footer className="space-y-2 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
        {isDirty && (
          <span aria-live="polite" className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Unsaved changes
          </span>
        )}
        <div
          className={
            onCancel ? "grid w-full grid-cols-2 gap-2" : "grid w-full grid-cols-1"
          }
        >
          {onCancel ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onCancel}
                data-tfu-no-enter-save
                className="w-full justify-center"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                className="w-full justify-center gap-1.5"
              >
                <Save className="h-3.5 w-3.5 shrink-0" />
                Save
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={!isDirty}
              className="w-full justify-center gap-1.5"
            >
              <Save className="h-3.5 w-3.5 shrink-0" />
              Save
            </Button>
          )}
        </div>
      </footer>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this stage?</DialogTitle>
            <DialogDescription>
              This removes{" "}
              <span className="font-medium text-gray-700 dark:text-gray-300">{node.data.label}</span>
              {" "}
              and its connections from the canvas. This cannot be undone here.
            </DialogDescription>
          </DialogHeader>
          <div className="grid w-full grid-cols-2 gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-center"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="w-full justify-center"
              onClick={confirmDelete}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

interface ColorPickerProps {
  value: string | undefined;
  defaultColor: string;
  onChange: (next: string | undefined) => void;
}

function ColorPicker({ value, defaultColor, onChange }: ColorPickerProps) {
  const isDefault = value === undefined;
  const normalize = (v: string) => v.toLowerCase();
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <div
          className="flex items-center gap-1.5 overflow-x-auto py-0.5 [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          <button
            type="button"
            aria-label="Use stage-type default color"
            aria-pressed={isDefault}
            title="Default (by stage type)"
            onClick={() => onChange(undefined)}
            className={cn(
              "relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-white dark:bg-gray-900 text-[10px] font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 transition",
              isDefault
                ? "border-gray-900 ring-2 ring-offset-1 ring-gray-300"
                : "border-gray-300 dark:border-gray-600 hover:border-gray-500",
            )}
            style={{ color: defaultColor }}
          >
            <span aria-hidden>A</span>
          </button>
          {TAG_COLORS.map((c) => {
            const selected = !isDefault && normalize(value!) === normalize(c.value);
            return (
              <button
                key={c.key}
                type="button"
                aria-label={c.label}
                aria-pressed={selected}
                title={c.label}
                onClick={() => onChange(c.value)}
                className={cn(
                  "h-6 w-6 shrink-0 rounded-full border transition",
                  selected
                    ? "border-gray-900 ring-2 ring-offset-1 ring-gray-300"
                    : "border-black/10 hover:scale-110",
                )}
                style={{ backgroundColor: c.value }}
              />
            );
          })}
        </div>
        {/* Right-edge fade as an affordance: "more colors over there". */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white to-transparent"
        />
      </div>
      <p className="text-[10px] text-gray-400 dark:text-gray-500">
        {isDefault ? "Using default color for this stage type." : "Custom color override."}
      </p>
    </div>
  );
}

interface RowListProps<T> {
  items: T[];
  renderRow: (item: T, index: number) => React.ReactNode;
  onAdd: () => void;
  addLabel: string;
  empty?: string;
}

function RowList<T>({ items, renderRow, onAdd, addLabel, empty }: RowListProps<T>) {
  return (
    <div className="space-y-1.5">
      {items.length === 0 && empty ? (
        <p className="rounded border border-dashed border-gray-200 dark:border-gray-700 px-2 py-1.5 text-[11px] text-gray-400 dark:text-gray-500">
          {empty}
        </p>
      ) : (
        items.map((item, i) => (
          <div key={i} className="rounded">
            {renderRow(item, i)}
          </div>
        ))
      )}
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-1 rounded border border-dashed border-gray-300 dark:border-gray-600 px-2 py-1 text-[11px] font-medium text-gray-600 dark:text-gray-400 dark:text-gray-500 hover:border-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        <Plus className="h-3 w-3" />
        {addLabel}
      </button>
    </div>
  );
}

function RemoveRowButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Remove row"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:bg-red-50 hover:text-red-600"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}

/* ───────────────────────── Column-aware inputs ──────────────────────────
 * ColumnInput: single column name. Renders as <input list=…> + <datalist>
 * so typed values still work as a fallback when the upstream isn't fully
 * declared. The wrapper has data-tfu-no-enter-save to prevent the global
 * Enter-saves-form shortcut from firing while the user is interacting with
 * the autocomplete list.
 *
 * ColumnTagsInput: multi-column selection rendered as chips with X-to-remove.
 * Add via Enter on the editor input or by picking a datalist suggestion.
 * ───────────────────────────────────────────────────────────────────────── */

interface ColumnInputProps {
  value: string;
  onChange: (next: string) => void;
  columns: InferredColumn[];
  placeholder?: string;
  disabled?: boolean;
}

function ColumnInput({
  value,
  onChange,
  columns,
  placeholder,
  disabled,
}: ColumnInputProps) {
  const listId = useId();
  return (
    <div data-tfu-no-enter-save>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={listId}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      <datalist id={listId}>
        {columns.map((c) => (
          <option key={c.name} value={c.name} label={c.type} />
        ))}
      </datalist>
    </div>
  );
}

interface ColumnTagsInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  columns: InferredColumn[];
  placeholder?: string;
}

function ColumnTagsInput({
  value,
  onChange,
  columns,
  placeholder,
}: ColumnTagsInputProps) {
  const listId = useId();
  const [draft, setDraft] = useState("");
  const known = new Set(value);
  const suggestions = columns.filter((c) => !known.has(c.name));

  const add = (col: string) => {
    const v = col.trim();
    if (!v || known.has(v)) {
      setDraft("");
      return;
    }
    onChange([...value, v]);
    setDraft("");
  };

  const removeAt = (idx: number) =>
    onChange(value.filter((_, i) => i !== idx));

  return (
    <div data-tfu-no-enter-save className="space-y-1.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((c, i) => (
            <span
              key={`${c}-${i}`}
              className="inline-flex items-center gap-1 rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-xs text-gray-700 dark:text-gray-300"
            >
              <span className="font-mono">{c}</span>
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label={`Remove ${c}`}
                className="text-gray-400 dark:text-gray-500 hover:text-red-600"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (
            e.key === "Backspace" &&
            !draft &&
            value.length > 0
          ) {
            e.preventDefault();
            removeAt(value.length - 1);
          } else if (e.key === ",") {
            e.preventDefault();
            add(draft);
          }
        }}
        onBlur={() => {
          if (draft) add(draft);
        }}
        list={listId}
        placeholder={placeholder ?? "Type or pick a column…"}
        autoComplete="off"
      />
      <datalist id={listId}>
        {suggestions.map((c) => (
          <option key={c.name} value={c.name} label={c.type} />
        ))}
      </datalist>
    </div>
  );
}

interface ConfigFieldsProps {
  config: StageConfig;
  onChange: (next: StageConfig) => void;
  columnsLookup?: UpstreamColumnsLookup;
}

function ConfigFields({ config, onChange, columnsLookup }: ConfigFieldsProps) {
  const upstream = (table: string): InferredColumn[] =>
    table && columnsLookup ? columnsLookup(table) : [];
  switch (config.stageType) {
    case "LOAD":
      return (
        <div className="space-y-3">
          <Field label="Table name">
            <Input
              value={config.tableName}
              onChange={(e) => onChange({ ...config, tableName: e.target.value })}
            />
          </Field>
          <Field label="Source (path or URI)">
            <Input
              value={config.source ?? ""}
              onChange={(e) => onChange({ ...config, source: e.target.value })}
              placeholder="e.g. customers.csv"
            />
          </Field>
        </div>
      );

    case "FILTER":
      return (
        <div className="space-y-3">
          <Field label="Source table">
            <Input
              value={config.table}
              onChange={(e) => onChange({ ...config, table: e.target.value })}
            />
          </Field>
          <Field label="Column">
            <ColumnInput
              value={config.column}
              onChange={(v) => onChange({ ...config, column: v })}
              columns={upstream(config.table)}
              placeholder="column"
            />
          </Field>
          <Field label="Operator">
            <Select
              value={config.operator}
              onValueChange={(v) =>
                onChange({ ...config, operator: v as FilterOperator })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["=", "!=", ">", "<", ">=", "<=", "LIKE", "IN"] as const).map(
                  (op) => (
                    <SelectItem key={op} value={op}>
                      {op}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Value">
            <Input
              value={config.value}
              onChange={(e) => onChange({ ...config, value: e.target.value })}
            />
          </Field>
        </div>
      );

    case "JOIN":
      return (
        <div className="space-y-3">
          <Field label="Join type">
            <Select
              value={config.joinType}
              onValueChange={(v) =>
                onChange({ ...config, joinType: v as JoinType })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["INNER", "LEFT", "RIGHT", "FULL OUTER"] as const).map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Left table">
              <Input
                value={config.leftTable}
                onChange={(e) =>
                  onChange({ ...config, leftTable: e.target.value })
                }
              />
            </Field>
            <Field label="Left key">
              <ColumnInput
                value={config.leftKey}
                onChange={(v) => onChange({ ...config, leftKey: v })}
                columns={upstream(config.leftTable)}
                placeholder="left column"
              />
            </Field>
            <Field label="Right table">
              <Input
                value={config.rightTable}
                onChange={(e) =>
                  onChange({ ...config, rightTable: e.target.value })
                }
              />
            </Field>
            <Field label="Right key">
              <ColumnInput
                value={config.rightKey}
                onChange={(v) => onChange({ ...config, rightKey: v })}
                columns={upstream(config.rightTable)}
                placeholder="right column"
              />
            </Field>
          </div>
        </div>
      );

    case "UNION":
      return (
        <div className="space-y-3">
          <Field label="Tables (comma-separated)">
            <Input
              value={config.tables.join(", ")}
              onChange={(e) =>
                onChange({
                  ...config,
                  tables: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={config.unionAll}
              onChange={(e) =>
                onChange({ ...config, unionAll: e.target.checked })
              }
              className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
            />
            UNION ALL (keep duplicates)
          </label>
        </div>
      );

    case "GROUP": {
      const updateAgg = (index: number, patch: Partial<GroupAggregation>) =>
        onChange({
          ...config,
          aggregations: config.aggregations.map((a, i) =>
            i === index ? { ...a, ...patch } : a,
          ),
        });
      const addAgg = () =>
        onChange({
          ...config,
          aggregations: [
            ...config.aggregations,
            { fn: "COUNT", column: "*", alias: "" },
          ],
        });
      const removeAgg = (index: number) =>
        onChange({
          ...config,
          aggregations: config.aggregations.filter((_, i) => i !== index),
        });
      return (
        <div className="space-y-3">
          <Field label="Source table">
            <Input
              value={config.table}
              onChange={(e) => onChange({ ...config, table: e.target.value })}
            />
          </Field>
          <Field label="Group by columns">
            <ColumnTagsInput
              value={config.groupBy}
              onChange={(next) => onChange({ ...config, groupBy: next })}
              columns={upstream(config.table)}
              placeholder="add a column…"
            />
          </Field>
          <Field label="Aggregations">
            <RowList
              items={config.aggregations}
              onAdd={addAgg}
              addLabel="Add aggregation"
              empty="No aggregations yet."
              renderRow={(a, i) => (
                <div className="grid grid-cols-[1fr_1fr_1.2fr_auto] gap-1.5">
                  <Select
                    value={a.fn}
                    onValueChange={(v) =>
                      updateAgg(i, { fn: v as AggregateFn })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["COUNT", "SUM", "AVG", "MIN", "MAX"] as const).map(
                        (fn) => (
                          <SelectItem key={fn} value={fn}>
                            {fn}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                  <ColumnInput
                    value={a.column}
                    onChange={(v) => updateAgg(i, { column: v })}
                    columns={upstream(config.table)}
                    placeholder="column"
                  />
                  <Input
                    value={a.alias}
                    onChange={(e) => updateAgg(i, { alias: e.target.value })}
                    placeholder="output name"
                  />
                  <RemoveRowButton onClick={() => removeAgg(i)} />
                </div>
              )}
            />
          </Field>
        </div>
      );
    }

    case "SORT":
      return (
        <div className="space-y-3">
          <Field label="Source table">
            <Input
              value={config.table}
              onChange={(e) => onChange({ ...config, table: e.target.value })}
            />
          </Field>
          <Field label="Sort column">
            <ColumnInput
              value={config.orderBy[0]?.column ?? ""}
              onChange={(v) =>
                onChange({
                  ...config,
                  orderBy: [
                    {
                      column: v,
                      direction: config.orderBy[0]?.direction ?? "ASC",
                    },
                  ],
                })
              }
              columns={upstream(config.table)}
              placeholder="column"
            />
          </Field>
          <Field label="Direction">
            <Select
              value={config.orderBy[0]?.direction ?? "ASC"}
              onValueChange={(v) =>
                onChange({
                  ...config,
                  orderBy: [
                    {
                      column: config.orderBy[0]?.column ?? "",
                      direction: v as SortDirection,
                    },
                  ],
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ASC">ASC</SelectItem>
                <SelectItem value="DESC">DESC</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      );

    case "SELECT":
      return (
        <div className="space-y-3">
          <Field label="Source table">
            <Input
              value={config.table}
              onChange={(e) => onChange({ ...config, table: e.target.value })}
            />
          </Field>
          <Field label="Columns">
            <ColumnTagsInput
              value={config.columns}
              onChange={(next) => onChange({ ...config, columns: next })}
              columns={upstream(config.table)}
              placeholder="add a column…"
            />
          </Field>
        </div>
      );

    case "PIVOT":
      return (
        <div className="space-y-3">
          <Field label="Source table">
            <Input
              value={config.table}
              onChange={(e) => onChange({ ...config, table: e.target.value })}
            />
          </Field>
          <Field label="Index column (row identifier)">
            <ColumnInput
              value={config.indexColumn}
              onChange={(v) => onChange({ ...config, indexColumn: v })}
              columns={upstream(config.table)}
              placeholder="e.g. region"
            />
          </Field>
          <Field label="Columns column (becomes new columns)">
            <ColumnInput
              value={config.columnsColumn}
              onChange={(v) => onChange({ ...config, columnsColumn: v })}
              columns={upstream(config.table)}
              placeholder="e.g. quarter"
            />
          </Field>
          <Field label="Values column (aggregated per cell)">
            <ColumnInput
              value={config.valuesColumn}
              onChange={(v) => onChange({ ...config, valuesColumn: v })}
              columns={upstream(config.table)}
              placeholder="e.g. revenue"
            />
          </Field>
          <Field label="Aggregation">
            <Select
              value={config.aggregation}
              onValueChange={(v) =>
                onChange({ ...config, aggregation: v as AggregateFn })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["COUNT", "SUM", "AVG", "MIN", "MAX"] as const).map((fn) => (
                  <SelectItem key={fn} value={fn}>
                    {fn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      );

    case "UNPIVOT":
      return (
        <div className="space-y-3">
          <Field label="Source table">
            <Input
              value={config.table}
              onChange={(e) => onChange({ ...config, table: e.target.value })}
            />
          </Field>
          <Field label="Identifier columns (kept)">
            <ColumnTagsInput
              value={config.idColumns}
              onChange={(next) => onChange({ ...config, idColumns: next })}
              columns={upstream(config.table)}
              placeholder="e.g. region"
            />
          </Field>
          <Field label="Value columns to unpivot">
            <ColumnTagsInput
              value={config.valueColumns}
              onChange={(next) => onChange({ ...config, valueColumns: next })}
              columns={upstream(config.table)}
              placeholder="e.g. q1"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Output name column">
              <Input
                value={config.nameColumn}
                onChange={(e) => onChange({ ...config, nameColumn: e.target.value })}
                placeholder="variable"
              />
            </Field>
            <Field label="Output value column">
              <Input
                value={config.valueColumn}
                onChange={(e) => onChange({ ...config, valueColumn: e.target.value })}
                placeholder="value"
              />
            </Field>
          </div>
        </div>
      );

    case "DEDUPE":
      return (
        <div className="space-y-3">
          <Field label="Source table">
            <Input
              value={config.table}
              onChange={(e) => onChange({ ...config, table: e.target.value })}
            />
          </Field>
          <Field label="Key columns (blank = all columns)">
            <ColumnTagsInput
              value={config.keyColumns}
              onChange={(next) => onChange({ ...config, keyColumns: next })}
              columns={upstream(config.table)}
              placeholder="add a key column…"
            />
          </Field>
          <Field label="Keep by (optional)">
            <div className="grid grid-cols-2 gap-2">
              <ColumnInput
                value={config.keepBy?.column ?? ""}
                onChange={(column) => {
                  if (!column) {
                    onChange({ ...config, keepBy: undefined });
                  } else {
                    onChange({
                      ...config,
                      keepBy: {
                        column,
                        direction: config.keepBy?.direction ?? "DESC",
                      },
                    });
                  }
                }}
                columns={upstream(config.table)}
                placeholder="column (blank = any)"
              />
              <Select
                value={config.keepBy?.direction ?? "DESC"}
                onValueChange={(v) =>
                  onChange({
                    ...config,
                    keepBy: config.keepBy
                      ? { ...config.keepBy, direction: v as SortDirection }
                      : { column: "", direction: v as SortDirection },
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DESC">Largest (keep last)</SelectItem>
                  <SelectItem value="ASC">Smallest (keep first)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Field>
        </div>
      );

    case "VALIDATE": {
      const updateRule = (index: number, patch: Partial<ValidateRule>) =>
        onChange({
          ...config,
          rules: config.rules.map((r, i) =>
            i === index ? { ...r, ...patch } : r,
          ),
        });
      const addRule = () =>
        onChange({
          ...config,
          rules: [
            ...config.rules,
            { column: "", operator: "=", value: "" },
          ],
        });
      const removeRule = (index: number) =>
        onChange({
          ...config,
          rules: config.rules.filter((_, i) => i !== index),
        });
      return (
        <div className="space-y-3">
          <Field label="Source table">
            <Input
              value={config.table}
              onChange={(e) => onChange({ ...config, table: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pass output table">
              <Input
                value={config.passOutput}
                onChange={(e) =>
                  onChange({ ...config, passOutput: e.target.value })
                }
                placeholder="e.g. clean_rows"
              />
            </Field>
            <Field label="Fail output table">
              <Input
                value={config.failOutput}
                onChange={(e) =>
                  onChange({ ...config, failOutput: e.target.value })
                }
                placeholder="e.g. rejected_rows"
              />
            </Field>
          </div>
          <Field label="Combine rules with">
            <Select
              value={config.combinator}
              onValueChange={(v) =>
                onChange({ ...config, combinator: v as "AND" | "OR" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AND">AND (all must pass)</SelectItem>
                <SelectItem value="OR">OR (any must pass)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Rules">
            <RowList
              items={config.rules}
              onAdd={addRule}
              addLabel="Add rule"
              empty="No rules yet — all rows pass."
              renderRow={(r, i) => (
                <div className="grid grid-cols-[1.2fr_1fr_1.2fr_auto] gap-1.5">
                  <ColumnInput
                    value={r.column}
                    onChange={(v) => updateRule(i, { column: v })}
                    columns={upstream(config.table)}
                    placeholder="column"
                  />
                  <Select
                    value={r.operator}
                    onValueChange={(v) =>
                      updateRule(i, { operator: v as FilterOperator })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        ["=", "!=", ">", "<", ">=", "<=", "LIKE", "IN"] as const
                      ).map((op) => (
                        <SelectItem key={op} value={op}>
                          {op}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={r.value}
                    onChange={(e) => updateRule(i, { value: e.target.value })}
                    placeholder="value"
                  />
                  <RemoveRowButton onClick={() => removeRule(i)} />
                </div>
              )}
            />
          </Field>
        </div>
      );
    }

    case "LOOKUP": {
      const updateEntry = (index: number, patch: Partial<LookupEntry>) =>
        onChange({
          ...config,
          dictionary: config.dictionary.map((e, i) =>
            i === index ? { ...e, ...patch } : e,
          ),
        });
      const addEntry = () =>
        onChange({
          ...config,
          dictionary: [...config.dictionary, { source: "", target: "" }],
        });
      const removeEntry = (index: number) =>
        onChange({
          ...config,
          dictionary: config.dictionary.filter((_, i) => i !== index),
        });
      return (
        <div className="space-y-3">
          <Field label="Source table">
            <Input
              value={config.table}
              onChange={(e) => onChange({ ...config, table: e.target.value })}
            />
          </Field>
          <Field label="Target column">
            <ColumnInput
              value={config.targetColumn}
              onChange={(v) => onChange({ ...config, targetColumn: v })}
              columns={upstream(config.table)}
              placeholder="column to evaluate"
            />
          </Field>
          <Field label="Output">
            <Select
              value={config.outputType}
              onValueChange={(v) =>
                onChange({ ...config, outputType: v as LookupOutputMode })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OVERWRITE">Overwrite existing column</SelectItem>
                <SelectItem value="NEW_COLUMN">Create new column</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {config.outputType === "NEW_COLUMN" && (
            <Field label="New column name">
              <Input
                value={config.newColumnName}
                onChange={(e) =>
                  onChange({ ...config, newColumnName: e.target.value })
                }
                placeholder="e.g. status_label"
              />
            </Field>
          )}
          <Field label="Fallback value (when no mapping matches)">
            <Input
              value={config.fallbackValue}
              onChange={(e) =>
                onChange({ ...config, fallbackValue: e.target.value })
              }
              placeholder="blank = NULL"
            />
          </Field>
          <Field label="Dictionary (source → target)">
            <RowList
              items={config.dictionary}
              onAdd={addEntry}
              addLabel="Add mapping"
              empty="No mappings yet."
              renderRow={(e, i) => (
                <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-1.5">
                  <Input
                    value={e.source}
                    onChange={(ev) =>
                      updateEntry(i, { source: ev.target.value })
                    }
                    placeholder="source key"
                  />
                  <span className="text-xs text-gray-400 dark:text-gray-500">→</span>
                  <Input
                    value={e.target}
                    onChange={(ev) =>
                      updateEntry(i, { target: ev.target.value })
                    }
                    placeholder="target value"
                  />
                  <RemoveRowButton onClick={() => removeEntry(i)} />
                </div>
              )}
            />
          </Field>
        </div>
      );
    }

    case "FORMULA": {
      const updateExpr = (
        index: number,
        patch: Partial<FormulaExpressionEntry>,
      ) =>
        onChange({
          ...config,
          expressions: config.expressions.map((e, i) =>
            i === index ? { ...e, ...patch } : e,
          ),
        });
      const addExpr = () =>
        onChange({
          ...config,
          expressions: [
            ...config.expressions,
            { outputColumn: "", category: "MATH", expression: "" },
          ],
        });
      const removeExpr = (index: number) =>
        onChange({
          ...config,
          expressions: config.expressions.filter((_, i) => i !== index),
        });
      return (
        <div className="space-y-3">
          <Field label="Source table">
            <Input
              value={config.table}
              onChange={(e) => onChange({ ...config, table: e.target.value })}
            />
          </Field>
          <Field label="Expressions">
            <RowList
              items={config.expressions}
              onAdd={addExpr}
              addLabel="Add expression"
              empty="No expressions yet."
              renderRow={(e, i) => (
                <div className="space-y-1.5 rounded-md border border-gray-200 dark:border-gray-700 p-2">
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
                    <Input
                      value={e.outputColumn}
                      onChange={(ev) =>
                        updateExpr(i, { outputColumn: ev.target.value })
                      }
                      placeholder="output column"
                    />
                    <Select
                      value={e.category}
                      onValueChange={(v) =>
                        updateExpr(i, { category: v as FormulaCategory })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MATH">Math</SelectItem>
                        <SelectItem value="STRING">String</SelectItem>
                        <SelectItem value="DATE">Date</SelectItem>
                        <SelectItem value="CONDITIONAL">Conditional</SelectItem>
                      </SelectContent>
                    </Select>
                    <RemoveRowButton onClick={() => removeExpr(i)} />
                  </div>
                  <textarea
                    value={e.expression}
                    onChange={(ev) =>
                      updateExpr(i, { expression: ev.target.value })
                    }
                    rows={2}
                    placeholder={
                      e.category === "STRING"
                        ? "e.g. UPPER(name)"
                        : e.category === "DATE"
                          ? "e.g. DATE_DIFF(now, signup_date, 'day')"
                          : e.category === "CONDITIONAL"
                            ? "e.g. IF(price > 10, 'High', 'Low')"
                            : "e.g. price * quantity"
                    }
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  />
                </div>
              )}
            />
          </Field>
        </div>
      );
    }

    case "WINDOW": {
      const updateOrder = (index: number, patch: Partial<{ column: string; direction: SortDirection }>) =>
        onChange({
          ...config,
          orderBy: config.orderBy.map((o, i) =>
            i === index ? { ...o, ...patch } : o,
          ),
        });
      const addOrder = () =>
        onChange({
          ...config,
          orderBy: [...config.orderBy, { column: "", direction: "ASC" }],
        });
      const removeOrder = (index: number) =>
        onChange({
          ...config,
          orderBy: config.orderBy.filter((_, i) => i !== index),
        });
      const updateOp = (index: number, patch: Partial<WindowOperationEntry>) =>
        onChange({
          ...config,
          operations: config.operations.map((o, i) =>
            i === index ? { ...o, ...patch } : o,
          ),
        });
      const addOp = () =>
        onChange({
          ...config,
          operations: [
            ...config.operations,
            { fn: "ROW_NUMBER", outputName: "" },
          ],
        });
      const removeOp = (index: number) =>
        onChange({
          ...config,
          operations: config.operations.filter((_, i) => i !== index),
        });
      return (
        <div className="space-y-3">
          <Field label="Source table">
            <Input
              value={config.table}
              onChange={(e) => onChange({ ...config, table: e.target.value })}
            />
          </Field>
          <Field label="Partition by (blank = single window)">
            <ColumnTagsInput
              value={config.partitionBy}
              onChange={(next) => onChange({ ...config, partitionBy: next })}
              columns={upstream(config.table)}
              placeholder="add a partition column…"
            />
          </Field>
          <Field label="Order by">
            <RowList
              items={config.orderBy}
              onAdd={addOrder}
              addLabel="Add order key"
              empty="No order keys yet."
              renderRow={(o, i) => (
                <div className="grid grid-cols-[1.4fr_1fr_auto] gap-1.5">
                  <ColumnInput
                    value={o.column}
                    onChange={(v) => updateOrder(i, { column: v })}
                    columns={upstream(config.table)}
                    placeholder="column"
                  />
                  <Select
                    value={o.direction}
                    onValueChange={(v) =>
                      updateOrder(i, { direction: v as SortDirection })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ASC">ASC</SelectItem>
                      <SelectItem value="DESC">DESC</SelectItem>
                    </SelectContent>
                  </Select>
                  <RemoveRowButton onClick={() => removeOrder(i)} />
                </div>
              )}
            />
          </Field>
          <Field label="Operations">
            <RowList
              items={config.operations}
              onAdd={addOp}
              addLabel="Add operation"
              empty="No operations yet."
              renderRow={(o, i) => {
                const needsTarget = !WINDOW_FNS_WITHOUT_TARGET.includes(o.fn);
                return (
                  <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5">
                    <Select
                      value={o.fn}
                      onValueChange={(v) =>
                        updateOp(i, { fn: v as WindowFn })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          [
                            "RANK",
                            "DENSE_RANK",
                            "ROW_NUMBER",
                            "LEAD",
                            "LAG",
                            "SUM",
                            "AVG",
                          ] as const
                        ).map((fn) => (
                          <SelectItem key={fn} value={fn}>
                            {fn}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <ColumnInput
                      value={o.targetColumn ?? ""}
                      onChange={(v) =>
                        updateOp(i, { targetColumn: v || undefined })
                      }
                      columns={upstream(config.table)}
                      placeholder={needsTarget ? "target column" : "n/a"}
                      disabled={!needsTarget}
                    />
                    <Input
                      value={o.outputName}
                      onChange={(e) =>
                        updateOp(i, { outputName: e.target.value })
                      }
                      placeholder="output name"
                    />
                    <RemoveRowButton onClick={() => removeOp(i)} />
                  </div>
                );
              }}
            />
          </Field>
        </div>
      );
    }

    case "CUSTOM":
      return (
        <Field label="SQL">
          <textarea
            value={config.sql}
            onChange={(e) => onChange({ ...config, sql: e.target.value })}
            rows={8}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            placeholder="SELECT * FROM ..."
          />
        </Field>
      );
  }
}
