export type StageType =
  | "LOAD"
  | "FILTER"
  | "JOIN"
  | "UNION"
  | "GROUP"
  | "SORT"
  | "SELECT"
  | "PIVOT"
  | "UNPIVOT"
  | "DEDUPE"
  | "VALIDATE"
  | "LOOKUP"
  | "FORMULA"
  | "WINDOW"
  | "CUSTOM";

export type FilterOperator = "=" | "!=" | ">" | "<" | ">=" | "<=" | "LIKE" | "IN";
export type JoinType = "INNER" | "LEFT" | "RIGHT" | "FULL OUTER";
export type SortDirection = "ASC" | "DESC";
export type AggregateFn = "COUNT" | "SUM" | "AVG" | "MIN" | "MAX";

export interface LoadConfig {
  stageType: "LOAD";
  tableName: string;
  source?: string;
}

export interface FilterConfig {
  stageType: "FILTER";
  table: string;
  column: string;
  operator: FilterOperator;
  value: string;
}

export interface JoinConfig {
  stageType: "JOIN";
  joinType: JoinType;
  leftTable: string;
  rightTable: string;
  leftKey: string;
  rightKey: string;
}

export interface UnionConfig {
  stageType: "UNION";
  tables: string[];
  unionAll: boolean;
}

export interface GroupAggregation {
  fn: AggregateFn;
  column: string;
  alias: string;
}

export interface GroupConfig {
  stageType: "GROUP";
  table: string;
  groupBy: string[];
  aggregations: GroupAggregation[];
}

export interface SortOrder {
  column: string;
  direction: SortDirection;
}

export interface SortConfig {
  stageType: "SORT";
  table: string;
  orderBy: SortOrder[];
}

export interface SelectConfig {
  stageType: "SELECT";
  table: string;
  columns: string[];
}

export interface PivotConfig {
  stageType: "PIVOT";
  table: string;
  /** Column whose values become the row identifier in the pivoted output. */
  indexColumn: string;
  /** Column whose distinct values become new output columns. */
  columnsColumn: string;
  /** Column whose values are aggregated into each pivoted cell. */
  valuesColumn: string;
  aggregation: AggregateFn;
}

export interface UnpivotConfig {
  stageType: "UNPIVOT";
  table: string;
  /** Columns kept as-is (identifiers) on each output row. */
  idColumns: string[];
  /** Columns to melt into rows. */
  valueColumns: string[];
  /** Name of the output column that holds the original column name. */
  nameColumn: string;
  /** Name of the output column that holds the value. */
  valueColumn: string;
}

export interface DedupeConfig {
  stageType: "DEDUPE";
  table: string;
  /** Columns that define a duplicate. Empty array = dedupe across all columns. */
  keyColumns: string[];
  /**
   * Optional tie-breaker: when duplicates exist, keep the row with the
   * min/max of this column. Omitted ⇒ any row may be kept.
   */
  keepBy?: { column: string; direction: SortDirection };
}

/* ----- VALIDATE: data-quality gate; routes rows to pass/fail outputs ----- */

export interface ValidateRule {
  column: string;
  operator: FilterOperator;
  value: string;
}

export interface ValidateConfig {
  stageType: "VALIDATE";
  table: string;
  /** How leaf rules combine. */
  combinator: "AND" | "OR";
  rules: ValidateRule[];
  /** Output table name for rows that satisfy the rules. */
  passOutput: string;
  /** Output table name for rows that don't. */
  failOutput: string;
}

/* ----- LOOKUP: dictionary swap (value mapping) ----- */

export interface LookupEntry {
  source: string;
  target: string;
}

export type LookupOutputMode = "OVERWRITE" | "NEW_COLUMN";

export interface LookupConfig {
  stageType: "LOOKUP";
  table: string;
  targetColumn: string;
  outputType: LookupOutputMode;
  /** Only used when outputType === "NEW_COLUMN". */
  newColumnName: string;
  dictionary: LookupEntry[];
  /** Empty ⇒ leave NULL when no mapping matches. */
  fallbackValue: string;
}

/* ----- FORMULA: per-row scalar expressions ----- */

export type FormulaCategory = "MATH" | "STRING" | "DATE" | "CONDITIONAL";

export interface FormulaExpressionEntry {
  outputColumn: string;
  category: FormulaCategory;
  expression: string;
}

export interface FormulaConfig {
  stageType: "FORMULA";
  table: string;
  expressions: FormulaExpressionEntry[];
}

/* ----- WINDOW: analytic functions over partitions ----- */

export type WindowFn =
  | "RANK"
  | "DENSE_RANK"
  | "ROW_NUMBER"
  | "LEAD"
  | "LAG"
  | "SUM"
  | "AVG";

/** Functions that don't need a `targetColumn` (pure-rank style). */
export const WINDOW_FNS_WITHOUT_TARGET: ReadonlyArray<WindowFn> = [
  "RANK",
  "DENSE_RANK",
  "ROW_NUMBER",
];

export interface WindowOperationEntry {
  fn: WindowFn;
  /** Required for SUM/AVG/LEAD/LAG; ignored for pure-rank functions. */
  targetColumn?: string;
  outputName: string;
}

export interface WindowConfig {
  stageType: "WINDOW";
  table: string;
  partitionBy: string[];
  orderBy: SortOrder[];
  operations: WindowOperationEntry[];
}

export interface CustomConfig {
  stageType: "CUSTOM";
  sql: string;
}

export type StageConfig =
  | LoadConfig
  | FilterConfig
  | JoinConfig
  | UnionConfig
  | GroupConfig
  | SortConfig
  | SelectConfig
  | PivotConfig
  | UnpivotConfig
  | DedupeConfig
  | ValidateConfig
  | LookupConfig
  | FormulaConfig
  | WindowConfig
  | CustomConfig;

export type ExecutionState = "pending" | "running" | "success" | "error";

export interface StageNodeData {
  stageType: StageType;
  label: string;
  stageIndex: number;
  outputTableName?: string;
  executionState?: ExecutionState;
  config: StageConfig;
  /** Overrides the default per-stage-type color when set. */
  color?: string;
  /** Overrides the type label shown on the node and in the config header. */
  displayType?: string;
  [key: string]: unknown;
}

export const STAGE_COLORS: Record<StageType, string> = {
  LOAD: "#34a853",
  FILTER: "#f59e0b",
  JOIN: "#3b82f6",
  UNION: "#a855f7",
  GROUP: "#ec4899",
  SORT: "#06b6d4",
  SELECT: "#14b8a6",
  PIVOT: "#8b5cf6",
  UNPIVOT: "#d946ef",
  DEDUPE: "#65a30d",
  VALIDATE: "#10b981",
  LOOKUP: "#0ea5e9",
  FORMULA: "#f97316",
  WINDOW: "#dc2626",
  CUSTOM: "#6b7280",
};

export interface TagColor {
  key: string;
  label: string;
  value: string;
}

export const TAG_COLORS: TagColor[] = [
  { key: "gray", label: "Gray", value: "#6b7280" },
  { key: "red", label: "Red", value: "#ef4444" },
  { key: "orange", label: "Orange", value: "#f97316" },
  { key: "amber", label: "Amber", value: "#f59e0b" },
  { key: "yellow", label: "Yellow", value: "#eab308" },
  { key: "lime", label: "Lime", value: "#84cc16" },
  { key: "green", label: "Green", value: "#22c55e" },
  { key: "teal", label: "Teal", value: "#14b8a6" },
  { key: "cyan", label: "Cyan", value: "#06b6d4" },
  { key: "blue", label: "Blue", value: "#3b82f6" },
  { key: "indigo", label: "Indigo", value: "#6366f1" },
  { key: "purple", label: "Purple", value: "#a855f7" },
  { key: "pink", label: "Pink", value: "#ec4899" },
  { key: "rose", label: "Rose", value: "#f43f5e" },
];

export function getStageColor(data: Pick<StageNodeData, "stageType" | "color">): string {
  return data.color ?? STAGE_COLORS[data.stageType];
}

export const STAGE_LABELS: Record<StageType, string> = {
  LOAD: "Load",
  FILTER: "Filter",
  JOIN: "Join",
  UNION: "Union",
  GROUP: "Group By",
  SORT: "Sort",
  SELECT: "Select",
  PIVOT: "Pivot",
  UNPIVOT: "Unpivot",
  DEDUPE: "Deduplicate",
  VALIDATE: "Validate",
  LOOKUP: "Lookup",
  FORMULA: "Formula",
  WINDOW: "Window",
  CUSTOM: "Custom SQL",
};

/**
 * One-line human-readable summary of a stage's operation. Used by the
 * info tooltip on each node and by the schema view header. Stable across
 * stages of the same type — distinguishes nodes by their actual params.
 */
export function describeStageOperation(operation: StageConfig): string {
  const op = operation;
  switch (op.stageType) {
    case "LOAD":
      return op.source ? `LOAD from ${op.source}` : `LOAD ${op.tableName}`;
    case "FILTER":
      return `FILTER ${op.column || "?"} ${op.operator} ${op.value || "?"}`;
    case "JOIN":
      return `${op.joinType} JOIN ${op.leftTable || "?"}.${op.leftKey || "?"} = ${op.rightTable || "?"}.${op.rightKey || "?"}`;
    case "UNION":
      return `${op.unionAll ? "UNION ALL" : "UNION"} ${op.tables.length} table${op.tables.length === 1 ? "" : "s"}`;
    case "GROUP":
      return `GROUP BY ${op.groupBy.join(", ") || "—"}${op.aggregations.length ? ` · ${op.aggregations.length} agg${op.aggregations.length === 1 ? "" : "s"}` : ""}`;
    case "SORT":
      return `SORT BY ${op.orderBy.map((o) => `${o.column} ${o.direction}`).join(", ") || "—"}`;
    case "SELECT":
      return `SELECT ${op.columns.length} column${op.columns.length === 1 ? "" : "s"}`;
    case "PIVOT":
      return `PIVOT ${op.valuesColumn || "?"} by ${op.columnsColumn || "?"} (${op.aggregation})`;
    case "UNPIVOT":
      return `UNPIVOT ${op.valueColumns.length} columns → (${op.nameColumn || "name"}, ${op.valueColumn || "value"})`;
    case "DEDUPE":
      return op.keyColumns.length
        ? `DEDUPE on ${op.keyColumns.join(", ")}${op.keepBy?.column ? ` (keep ${op.keepBy.direction} of ${op.keepBy.column})` : ""}`
        : `DEDUPE all columns`;
    case "VALIDATE":
      return `VALIDATE ${op.rules.length} rule${op.rules.length === 1 ? "" : "s"} → pass=${op.passOutput || "?"}, fail=${op.failOutput || "?"}`;
    case "LOOKUP":
      return op.outputType === "NEW_COLUMN"
        ? `LOOKUP ${op.targetColumn || "?"} → ${op.newColumnName || "?"} (${op.dictionary.length} mappings)`
        : `LOOKUP ${op.targetColumn || "?"} (overwrite, ${op.dictionary.length} mappings)`;
    case "FORMULA":
      return `FORMULA ${op.expressions.length} expression${op.expressions.length === 1 ? "" : "s"}`;
    case "WINDOW":
      return `WINDOW ${op.operations.length} op${op.operations.length === 1 ? "" : "s"}${op.partitionBy.length ? ` · partition=${op.partitionBy.join(", ")}` : ""}`;
    case "CUSTOM":
      return "CUSTOM SQL";
  }
}

export function defaultConfigFor(stageType: StageType): StageConfig {
  switch (stageType) {
    case "LOAD":
      return { stageType, tableName: "input", source: "" };
    case "FILTER":
      return { stageType, table: "", column: "", operator: "=", value: "" };
    case "JOIN":
      return {
        stageType,
        joinType: "INNER",
        leftTable: "",
        rightTable: "",
        leftKey: "",
        rightKey: "",
      };
    case "UNION":
      return { stageType, tables: [], unionAll: false };
    case "GROUP":
      return { stageType, table: "", groupBy: [], aggregations: [] };
    case "SORT":
      return { stageType, table: "", orderBy: [] };
    case "SELECT":
      return { stageType, table: "", columns: [] };
    case "PIVOT":
      return {
        stageType,
        table: "",
        indexColumn: "",
        columnsColumn: "",
        valuesColumn: "",
        aggregation: "SUM",
      };
    case "UNPIVOT":
      return {
        stageType,
        table: "",
        idColumns: [],
        valueColumns: [],
        nameColumn: "variable",
        valueColumn: "value",
      };
    case "DEDUPE":
      return { stageType, table: "", keyColumns: [] };
    case "VALIDATE":
      return {
        stageType,
        table: "",
        combinator: "AND",
        rules: [],
        passOutput: "",
        failOutput: "",
      };
    case "LOOKUP":
      return {
        stageType,
        table: "",
        targetColumn: "",
        outputType: "OVERWRITE",
        newColumnName: "",
        dictionary: [],
        fallbackValue: "",
      };
    case "FORMULA":
      return {
        stageType,
        table: "",
        expressions: [],
      };
    case "WINDOW":
      return {
        stageType,
        table: "",
        partitionBy: [],
        orderBy: [],
        operations: [],
      };
    case "CUSTOM":
      return { stageType, sql: "" };
  }
}
