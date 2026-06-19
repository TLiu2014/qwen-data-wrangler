import { BookOpen, Home, Moon, Sun } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SettingsMenu } from "@/components/SettingsMenu";
import type { Settings } from "@/hooks/useSettings";
import type { RegisteredTable } from "@/lib/queryEngine";

export interface TopNavProps {
  settings: Settings;
  onSettingChange: <K extends keyof Settings>(
    key: K,
    value: Settings[K],
  ) => void;
  tables: RegisteredTable[];
  onUploadCsv: (tableName: string, csvText: string) => Promise<void> | void;
  onRemoveTable: (tableName: string) => Promise<void> | void;
}

export function TopNav({
  settings,
  onSettingChange,
  tables,
  onUploadCsv,
  onRemoveTable,
}: TopNavProps) {
  const dark = settings.theme === "dark";
  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="font-semibold tracking-tight text-slate-900 transition-colors hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-300"
        >
          Qwen Data Wrangler
        </Link>
      </div>
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="icon" aria-label="Home">
          <Link to="/" title="Back to home">
            <Home className="h-4 w-4" />
          </Link>
        </Button>
        <Button asChild variant="outline" size="icon" aria-label="Docs">
          <Link to="/docs" title="Architecture &amp; tool reference">
            <BookOpen className="h-4 w-4" />
          </Link>
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
          title={dark ? "Switch to light theme" : "Switch to dark theme"}
          onClick={() => onSettingChange("theme", dark ? "light" : "dark")}
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <SettingsMenu
          settings={settings}
          onChange={onSettingChange}
          tables={tables}
          onUploadCsv={onUploadCsv}
          onRemoveTable={onRemoveTable}
        />
      </div>
    </header>
  );
}
