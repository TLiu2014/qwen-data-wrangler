import { Group, Panel, Separator } from "react-resizable-panels";
import { cn } from "@/lib/utils";
import type { LayoutMode } from "@/hooks/useSettings";

export interface WorkspaceLayoutProps {
  layoutMode: LayoutMode;
  canvas: React.ReactNode;
  results: React.ReactNode;
}

/**
 * Resizable canvas/results split. The Group re-mounts when orientation
 * changes — that way each layout keeps its own saved size in localStorage.
 */
export function WorkspaceLayout({
  layoutMode,
  canvas,
  results,
}: WorkspaceLayoutProps) {
  const horizontal = layoutMode === "horizontal";
  return (
    <Group
      key={layoutMode}
      id={`qwen-workspace-${layoutMode}`}
      orientation={horizontal ? "horizontal" : "vertical"}
      defaultLayout={{
        canvas: horizontal ? 62 : 60,
        results: horizontal ? 38 : 40,
      }}
      className="h-full w-full"
    >
      <Panel id="canvas" minSize={25}>
        <div className="h-full w-full">{canvas}</div>
      </Panel>
      <Separator
        className={cn(
          "shrink-0 bg-slate-200 transition-colors hover:bg-indigo-400 dark:bg-slate-700",
          horizontal ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize",
        )}
      />
      <Panel id="results" minSize={20}>
        <div className="h-full w-full">{results}</div>
      </Panel>
    </Group>
  );
}
