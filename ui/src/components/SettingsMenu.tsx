import {
  Settings as SettingsIcon,
  Eye,
  EyeOff,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Settings } from "@/hooks/useSettings";
import type { RegisteredTable } from "@/lib/queryEngine";
import { useEngineReady } from "@/hooks/useEngineReady";

export interface SettingsMenuProps {
  settings: Settings;
  onChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  tables: RegisteredTable[];
  onUploadCsv: (tableName: string, csvText: string) => Promise<void> | void;
  onRemoveTable: (tableName: string) => Promise<void> | void;
}

export function SettingsMenu({
  settings,
  onChange,
  tables,
  onUploadCsv,
  onRemoveTable,
}: SettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const [revealKey, setRevealKey] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Click-outside + Escape to dismiss.
  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || buttonRef.current?.contains(t))
        return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative">
      <Button
        ref={buttonRef}
        variant="outline"
        size="icon"
        aria-label="Settings"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <SettingsIcon className="h-4 w-4" />
      </Button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Settings"
          className="absolute right-0 top-full z-50 mt-2 w-[22rem] max-h-[80vh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="space-y-4 text-sm">
            <Section title="API key">
              <label
                htmlFor="settings-api-key"
                className="sr-only"
              >
                DashScope API key
              </label>
              <div className="flex gap-2">
                <Input
                  id="settings-api-key"
                  type={revealKey ? "text" : "password"}
                  value={settings.apiKey}
                  onChange={(e) => onChange("apiKey", e.target.value)}
                  placeholder="sk-…"
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={revealKey ? "Hide key" : "Show key"}
                  onClick={() => setRevealKey((v) => !v)}
                >
                  {revealKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <Hint>
                Overrides the server's <code>DASHSCOPE_API_KEY</code>. Stored
                in <code>sessionStorage</code> for this tab only.
              </Hint>
            </Section>

            <Section title="Data">
              <DataSection
                tables={tables}
                onUploadCsv={onUploadCsv}
                onRemoveTable={onRemoveTable}
              />
            </Section>

            <Section title="Sample flow">
              <Radio
                checked={settings.sampleFlow === "two-sources"}
                onChange={() => onChange("sampleFlow", "two-sources")}
                label="Two source tables (default)"
                hint="Just the customers and orders LOAD nodes. Build the rest by chatting with the agent."
              />
              <Radio
                checked={settings.sampleFlow === "revenue-by-region"}
                onChange={() => onChange("sampleFlow", "revenue-by-region")}
                label="Revenue by region"
                hint="Full pipeline: two LOADs → JOIN → FILTER (status='active') → GROUP by region."
              />
            </Section>

            <Section title="Layout">
              <Radio
                checked={settings.layoutMode === "horizontal"}
                onChange={() => onChange("layoutMode", "horizontal")}
                label="Canvas left, results right (default)"
              />
              <Radio
                checked={settings.layoutMode === "vertical"}
                onChange={() => onChange("layoutMode", "vertical")}
                label="Canvas on top, results below"
              />
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <div className="border-b border-slate-200 pb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:border-slate-700 dark:text-slate-500">
        {title}
      </div>
      <div className="space-y-1.5 pt-1">{children}</div>
    </section>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] text-slate-500 dark:text-slate-400">{children}</p>
  );
}

function DataSection({
  tables,
  onUploadCsv,
  onRemoveTable,
}: {
  tables: RegisteredTable[];
  onUploadCsv: (tableName: string, csvText: string) => Promise<void> | void;
  onRemoveTable: (tableName: string) => Promise<void> | void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const engineReady = useEngineReady();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-uploading the same filename
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const text = await file.text();
      // Strip .csv (case-insensitive) and any path leftovers, snake_case the
      // rest so the agent gets a clean table identifier to SQL against.
      const base = file.name.replace(/\.csv$/i, "").replace(/[^\w]+/g, "_");
      const tableName = base.toLowerCase() || `table_${Date.now()}`;
      await onUploadCsv(tableName, text);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium",
          engineReady
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
            : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300",
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            engineReady
              ? "bg-emerald-500"
              : "bg-amber-500 animate-pulse",
          )}
        />
        DuckDB · {engineReady ? "connected" : "warming up…"}
      </div>
      <ul className="space-y-1">
        {tables.length === 0 ? (
          <li className="text-[11px] italic text-slate-500 dark:text-slate-400">
            No tables loaded yet.
          </li>
        ) : (
          tables.map((t) => (
            <li
              key={t.name}
              className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[11px] font-medium text-slate-700 dark:text-slate-200">
                  {t.name}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-500">
                  {t.columns.length} col{t.columns.length === 1 ? "" : "s"}
                  {typeof t.rowCount === "number" && (
                    <> · {t.rowCount} row{t.rowCount === 1 ? "" : "s"}</>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void onRemoveTable(t.name)}
                aria-label={`Remove ${t.name}`}
                title={`Remove ${t.name}`}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800 dark:hover:text-rose-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))
        )}
      </ul>
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onFile}
          className="sr-only"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" />
          {busy ? "Loading…" : "Upload CSV"}
        </Button>
      </div>
      {error && (
        <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p>
      )}
      <Hint>
        CSVs are loaded into in-browser DuckDB and sent to Qwen as schema
        context with each prompt.
      </Hint>
    </div>
  );
}

function Radio({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-2 text-sm",
        disabled
          ? "cursor-not-allowed text-slate-400 dark:text-slate-600"
          : "cursor-pointer text-slate-700 dark:text-slate-200",
      )}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 cursor-pointer border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
      />
      <span className="flex-1">
        <span className={disabled ? "" : "font-medium"}>{label}</span>
        {hint && (
          <span
            className={cn(
              "mt-0.5 block text-[11px] font-normal",
              disabled
                ? "text-slate-400 dark:text-slate-600"
                : "text-slate-500 dark:text-slate-400",
            )}
          >
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}
