import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@flow/components/ui/Table";
import type { ColumnType } from "@flow/Schema";

export interface DataTableColumn {
  name: string;
  type?: ColumnType;
}

export interface DataTableViewProps {
  columns: DataTableColumn[];
  /**
   * Rows of the result table. Each row keys columns by name. Values may be
   * primitives, arrays, or nested objects — non-primitive cells are rendered
   * as JSON strings to keep this component dependency-free.
   */
  rows: Array<Record<string, unknown>>;
  /** Shown when rows is empty. */
  emptyMessage?: string;
  /** Optional caption/header text rendered above the table. */
  caption?: string;
}

/**
 * Pure UI: renders an immutable preview of a result table. The library
 * never executes data — the host is responsible for producing the rows
 * (e.g. by running SQL or hitting a backend).
 */
export function DataTableView({
  columns,
  rows,
  emptyMessage = "No rows.",
  caption,
}: DataTableViewProps) {
  if (columns.length === 0 && rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {caption && (
        <div className="flex h-8 shrink-0 items-center border-b border-gray-200 dark:border-gray-700 bg-gray-50 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400 dark:text-gray-500">
          {caption}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 text-right text-[10px] text-gray-400 dark:text-gray-500">
                #
              </TableHead>
              {columns.map((c) => (
                <TableHead key={c.name}>
                  <div className="flex items-center gap-1">
                    <span className="font-mono">{c.name}</span>
                    {c.type && (
                      <span className="rounded bg-gray-100 dark:bg-gray-800 px-1 py-px font-mono text-[9px] font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500">
                        {c.type}
                      </span>
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + 1}
                  className="py-6 text-center text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, i) => (
                <TableRow key={i}>
                  <TableCell className="text-right text-[10px] text-gray-400 dark:text-gray-500">
                    {i + 1}
                  </TableCell>
                  {columns.map((c) => (
                    <TableCell key={c.name} className="font-mono text-xs">
                      {formatCell(row[c.name])}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
