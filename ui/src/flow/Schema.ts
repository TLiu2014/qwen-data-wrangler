import type { Edge, Node } from "@xyflow/react";
import type {
  StageConfig,
  StageNodeData,
  StageType,
} from "@flow/types/Pipeline";

/**
 * Pipeline schema designed for data engineers.
 *
 *   `pipeline`  — top-level metadata
 *   `datasets`  — input data schemas (column names + inferred types)
 *   `stages`    — ordered DAG of transformations: each stage declares its
 *                 inputs, output table, dependencies, and operation params
 *   `layout`    — secondary, UI-only: node positions + edges to round-trip
 *                 the canvas. Safe to drop if you only care about the data.
 */
export interface PipelineSchema {
  version: "1.0";
  pipeline: {
    name: string;
    createdAt: string;
    description?: string;
  };
  datasets: Record<string, DatasetSchema>;
  stages: SerializedStage[];
  layout: PipelineLayout;
}

export interface DatasetSchema {
  columns: Array<{ name: string; type: ColumnType }>;
}

export type ColumnType =
  | "integer"
  | "float"
  | "string"
  | "boolean"
  | "date"
  | "timestamp"
  | "unknown";

export interface SerializedStage {
  id: string;
  name: string;
  type: StageType;
  depends_on: string[];
  inputs: string[];
  output: string;
  operation: StageConfig;
  /** User-chosen color override (hex). Omitted to use the stage-type default. */
  color?: string;
  /** User-chosen label override for the type badge on the node. */
  displayType?: string;
}

export interface PipelineLayout {
  nodes: Array<{ id: string; position: { x: number; y: number } }>;
  edges: Array<{ id: string; source: string; target: string }>;
}

export interface SerializeOptions {
  name: string;
  description?: string;
}

/**
 * Serialize a React Flow graph into the data-engineer-readable PipelineSchema.
 * `inputs` for each stage are derived from `operation` (FILTER.table, JOIN.left/rightTable,
 * etc.) so the JSON makes sense without inspecting the canvas.
 */
export function serializePipeline(
  nodes: Node<StageNodeData>[],
  edges: Edge[],
  options: SerializeOptions,
): PipelineSchema {
  const stages = orderNodesTopologically(nodes, edges).map((node) =>
    toSerializedStage(node, edges),
  );

  return {
    version: "1.0",
    pipeline: {
      name: options.name,
      createdAt: new Date().toISOString(),
      ...(options.description ? { description: options.description } : {}),
    },
    datasets: collectDatasets(stages),
    stages,
    layout: {
      nodes: nodes.map((n) => ({ id: n.id, position: n.position })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
      })),
    },
  };
}

function toSerializedStage(
  node: Node<StageNodeData>,
  edges: Edge[],
): SerializedStage {
  const dependsOn = edges
    .filter((e) => e.target === node.id)
    .map((e) => e.source);

  const inputs = collectStageInputs(node.data.config);
  const fallbackOutput = `${node.data.stageType.toLowerCase()}_${node.data.stageIndex}`;

  return {
    id: node.id,
    name: slugify(node.data.label) || fallbackOutput,
    type: node.data.stageType,
    depends_on: dependsOn,
    inputs,
    output: node.data.outputTableName ?? fallbackOutput,
    operation: node.data.config,
    ...(node.data.color ? { color: node.data.color } : {}),
    ...(node.data.displayType ? { displayType: node.data.displayType } : {}),
  };
}

function collectStageInputs(config: StageConfig): string[] {
  switch (config.stageType) {
    case "LOAD":
      return [];
    case "FILTER":
    case "GROUP":
    case "SORT":
    case "SELECT":
    case "PIVOT":
    case "UNPIVOT":
    case "DEDUPE":
    case "VALIDATE":
    case "LOOKUP":
    case "FORMULA":
    case "WINDOW":
      return config.table ? [config.table] : [];
    case "JOIN":
      return [config.leftTable, config.rightTable].filter(Boolean) as string[];
    case "UNION":
      return [...config.tables];
    case "CUSTOM":
      return [];
  }
}

function collectDatasets(
  stages: SerializedStage[],
): Record<string, DatasetSchema> {
  const datasets: Record<string, DatasetSchema> = {};
  for (const stage of stages) {
    if (stage.type !== "LOAD") continue;
    const op = stage.operation;
    if (op.stageType !== "LOAD") continue;
    const tableName = op.tableName || stage.output;
    datasets[tableName] = { columns: [] };
  }
  return datasets;
}

function orderNodesTopologically(
  nodes: Node<StageNodeData>[],
  edges: Edge[],
): Node<StageNodeData>[] {
  const indegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const adj = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const edge of edges) {
    if (!indegree.has(edge.source) || !indegree.has(edge.target)) continue;
    adj.get(edge.source)!.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of indegree) if (deg === 0) queue.push(id);
  queue.sort((a, b) => indexOrZero(nodes, a) - indexOrZero(nodes, b));

  const ordered: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    ordered.push(id);
    for (const next of adj.get(id) ?? []) {
      const d = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }

  // Cycle fallback: append any remaining nodes in original order.
  if (ordered.length < nodes.length) {
    const seen = new Set(ordered);
    for (const n of nodes) if (!seen.has(n.id)) ordered.push(n.id);
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  return ordered.map((id) => byId.get(id)!).filter(Boolean);
}

function indexOrZero(nodes: Node<StageNodeData>[], id: string): number {
  return nodes.findIndex((n) => n.id === id);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export interface DeserializedPipeline {
  name: string;
  nodes: Node<StageNodeData>[];
  edges: Edge[];
}

/** Inverse of serializePipeline (best-effort; `layout` carries positions). */
export function deserializePipeline(schema: PipelineSchema): DeserializedPipeline {
  const positions = new Map(
    schema.layout.nodes.map((n) => [n.id, n.position]),
  );
  const nodes: Node<StageNodeData>[] = schema.stages.map((stage, i) => ({
    id: stage.id,
    type: "stageNode",
    position: positions.get(stage.id) ?? { x: 80, y: 80 + i * 140 },
    data: {
      stageType: stage.type,
      label: stage.name,
      stageIndex: i + 1,
      outputTableName: stage.output,
      config: stage.operation,
      ...(stage.color ? { color: stage.color } : {}),
      ...(stage.displayType ? { displayType: stage.displayType } : {}),
    },
  }));

  return {
    name: schema.pipeline.name,
    nodes,
    edges: schema.layout.edges.map((e) => ({ ...e })),
  };
}

/* ------------------------------------------------------------------------- *
 * AI / agent payload
 *
 * The model is treated as a stateless processor: feed it the data contract
 * (datasets + stages), get SQL back. Versioning, pipeline metadata, and
 * canvas layout are host-side concerns — they live in the prompt or the
 * surrounding UI, not in the payload.
 * ------------------------------------------------------------------------- */

/** Stage as seen by the model. UI-only fields stripped. */
export interface AIPipelineStage {
  id: string;
  name: string;
  type: StageType;
  depends_on: string[];
  inputs: string[];
  output: string;
  operation: StageConfig;
}

/** Minimal payload for the model: just the data contract. */
export interface AIPipelineSchema {
  datasets: Record<string, DatasetSchema>;
  stages: AIPipelineStage[];
}

/**
 * Strip everything the model doesn't need and return the schema-only
 * payload. Pipeline name/description, version, layout, and per-stage
 * cosmetics (color, displayType) are intentionally dropped — pass any
 * pipeline-level intent (name, dialect, engine, etc.) via the prompt.
 */
export function toAISchema(schema: PipelineSchema): AIPipelineSchema {
  const stages: AIPipelineStage[] = schema.stages.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    depends_on: [...s.depends_on],
    inputs: [...s.inputs],
    output: s.output,
    operation: s.operation,
  }));

  return {
    datasets: schema.datasets,
    stages,
  };
}

export interface FromAIOptions {
  /**
   * Previous UI-side schema. When provided:
   *  - UI-only fields (`color`, `displayType`) on stages with matching ids
   *    are restored.
   *  - `pipeline.name` / `description` / `createdAt` are preserved.
   *  - `layout` entries for surviving stages are preserved.
   */
  base?: PipelineSchema;
}

/**
 * Inverse of toAISchema: project a model response back into a full
 * PipelineSchema. The model only carries `datasets` and `stages`, so
 * everything else (pipeline metadata, layout, per-stage cosmetics) is
 * reconstructed from `options.base` when available.
 */
export function fromAISchema(
  ai: AIPipelineSchema,
  options: FromAIOptions = {},
): PipelineSchema {
  const { base } = options;
  const baseStageById = new Map(base?.stages.map((s) => [s.id, s]) ?? []);

  const stages: SerializedStage[] = ai.stages.map((s) => {
    const prev = baseStageById.get(s.id);
    return {
      id: s.id,
      name: s.name,
      type: s.type,
      depends_on: [...s.depends_on],
      inputs: [...s.inputs],
      output: s.output,
      operation: s.operation,
      ...(prev?.color ? { color: prev.color } : {}),
      ...(prev?.displayType ? { displayType: prev.displayType } : {}),
    };
  });

  // Layout is host-side: only carry over the entries for stages the model
  // kept. Missing positions get auto-laid-out by deserializePipeline.
  const stageIds = new Set(stages.map((s) => s.id));
  const layout: PipelineLayout = base
    ? {
        nodes: base.layout.nodes.filter((n) => stageIds.has(n.id)),
        edges: base.layout.edges.filter(
          (e) => stageIds.has(e.source) && stageIds.has(e.target),
        ),
      }
    : { nodes: [], edges: [] };

  return {
    version: "1.0",
    pipeline: {
      name: base?.pipeline.name ?? "pipeline",
      createdAt: base?.pipeline.createdAt ?? new Date().toISOString(),
      ...(base?.pipeline.description
        ? { description: base.pipeline.description }
        : {}),
    },
    datasets: ai.datasets,
    stages,
    layout,
  };
}

/**
 * Lightweight check on a parsed AI / backend response. Returns null when
 * valid, otherwise a short error message.
 */
export function validateAIPipelineSchema(value: unknown): string | null {
  if (!value || typeof value !== "object") return "Expected an object";
  const v = value as Record<string, unknown>;
  if (!v.datasets || typeof v.datasets !== "object")
    return "Missing or invalid `datasets`";
  if (!Array.isArray(v.stages)) return "Missing or invalid `stages` array";
  return null;
}

/**
 * Lightweight runtime check that a parsed object looks like a PipelineSchema.
 * Returns null when valid, or a short error message otherwise. Useful for
 * validating user-pasted JSON before calling deserializePipeline.
 */
export function validatePipelineSchema(value: unknown): string | null {
  if (!value || typeof value !== "object") return "Expected an object";
  const v = value as Record<string, unknown>;
  if (v.version !== "1.0") return `Unsupported version: ${String(v.version)}`;
  if (!v.pipeline || typeof v.pipeline !== "object")
    return "Missing or invalid `pipeline`";
  if (!Array.isArray(v.stages)) return "Missing or invalid `stages` array";
  if (!v.layout || typeof v.layout !== "object") return "Missing `layout`";
  const layout = v.layout as Record<string, unknown>;
  if (!Array.isArray(layout.nodes) || !Array.isArray(layout.edges))
    return "`layout.nodes` and `layout.edges` must be arrays";
  return null;
}

/* ------------------------------------------------------------------------- *
 * Output schema inference
 *
 * The UI module never executes data, so we can only *infer* output columns
 * from the operation parameters. inferOutputSchemas walks stages in order and
 * threads each input's columns through the operation to produce a best-effort
 * output schema. Useful for a "Data Schema" panel without a real engine.
 * ------------------------------------------------------------------------- */

export interface InferredColumn {
  name: string;
  type: ColumnType;
  /** Origin: "{datasetOrTable}.{column}" when traceable, else stage.output. */
  source?: string;
}

export interface StageOutputSchema {
  stageId: string;
  output: string;
  columns: InferredColumn[];
  /** false for LOAD (taken directly from datasets), true for derived stages. */
  inferred: boolean;
  /** Set when inference couldn't determine columns (e.g. CUSTOM, missing input). */
  unknown?: boolean;
}

/** Map keyed by stage.id. Iteration order matches schema.stages order. */
export type InferredSchemaMap = Map<string, StageOutputSchema>;

export function inferOutputSchemas(schema: PipelineSchema): InferredSchemaMap {
  const result: InferredSchemaMap = new Map();
  for (const stage of schema.stages) {
    result.set(stage.id, computeStageOutput(stage, schema, result));
  }
  return result;
}

/**
 * Look up the columns of a table by name. Resolves in this priority:
 *   1. The output of a stage whose `output` matches the name (most recent wins).
 *   2. A raw dataset entry.
 *   3. Empty array.
 *
 * Useful for column-aware editor dropdowns. Build once per schema change.
 */
export type UpstreamColumnsLookup = (tableName: string) => InferredColumn[];

export function buildColumnsLookup(schema: PipelineSchema): UpstreamColumnsLookup {
  const inferred = inferOutputSchemas(schema);
  const byTable = new Map<string, InferredColumn[]>();
  // Stage outputs: later stages with the same name overwrite (matches the
  // resolution rule inside inferOutputSchemas).
  for (const s of inferred.values()) byTable.set(s.output, s.columns);
  // Datasets are a fallback (LOAD stages already register their dataset
  // names via their stage output).
  for (const [name, ds] of Object.entries(schema.datasets)) {
    if (!byTable.has(name)) {
      byTable.set(
        name,
        ds.columns.map((c) => ({ ...c, source: `${name}.${c.name}` })),
      );
    }
  }
  return (tableName: string) => byTable.get(tableName) ?? [];
}

function computeStageOutput(
  stage: SerializedStage,
  schema: PipelineSchema,
  prior: InferredSchemaMap,
): StageOutputSchema {
  const op = stage.operation;
  switch (op.stageType) {
    case "LOAD": {
      const tableName = op.tableName || stage.output;
      const dataset = schema.datasets[tableName];
      return {
        stageId: stage.id,
        output: stage.output,
        columns: (dataset?.columns ?? []).map((c) => ({
          ...c,
          source: `${tableName}.${c.name}`,
        })),
        inferred: false,
      };
    }
    case "FILTER":
    case "SORT":
    case "DEDUPE":
    case "VALIDATE": {
      // VALIDATE has two outputs (pass + fail) with identical column schemas.
      // The map keys by stage.id and reports the pass schema (= input columns);
      // the fail side has the same shape and can be looked up by failOutput.
      const cols = lookupColumnsByTableName(op.table, schema, prior);
      return {
        stageId: stage.id,
        output: stage.output,
        columns: cols,
        inferred: true,
      };
    }
    case "SELECT": {
      const cols = lookupColumnsByTableName(op.table, schema, prior);
      const keep = new Set(op.columns);
      const projected = cols.filter((c) => keep.has(c.name));
      const missing = op.columns
        .filter((name) => !cols.some((c) => c.name === name))
        .map<InferredColumn>((name) => ({ name, type: "unknown" }));
      return {
        stageId: stage.id,
        output: stage.output,
        columns: [...projected, ...missing],
        inferred: true,
      };
    }
    case "JOIN": {
      const left = lookupColumnsByTableName(op.leftTable, schema, prior);
      const right = lookupColumnsByTableName(op.rightTable, schema, prior);
      // Drop the right-side join key to mimic typical SQL projections.
      const rightProjected = right.filter((c) => c.name !== op.rightKey);
      // Disambiguate name collisions with an underscore suffix.
      const leftNames = new Set(left.map((c) => c.name));
      const merged = [
        ...left,
        ...rightProjected.map((c) =>
          leftNames.has(c.name) ? { ...c, name: `${c.name}_right` } : c,
        ),
      ];
      return {
        stageId: stage.id,
        output: stage.output,
        columns: merged,
        inferred: true,
      };
    }
    case "UNION": {
      const first = op.tables[0]
        ? lookupColumnsByTableName(op.tables[0], schema, prior)
        : [];
      return {
        stageId: stage.id,
        output: stage.output,
        columns: first,
        inferred: true,
      };
    }
    case "GROUP": {
      const cols = lookupColumnsByTableName(op.table, schema, prior);
      const grouped = op.groupBy.map<InferredColumn>(
        (name) =>
          cols.find((c) => c.name === name) ?? { name, type: "unknown" },
      );
      const aggregated = op.aggregations.map<InferredColumn>((a) => ({
        name: a.alias || `${a.fn.toLowerCase()}_${a.column}`,
        type: aggregateOutputType(a.fn),
      }));
      return {
        stageId: stage.id,
        output: stage.output,
        columns: [...grouped, ...aggregated],
        inferred: true,
      };
    }
    case "PIVOT": {
      // The new columns come from runtime-distinct values of columnsColumn,
      // which the UI can't see — schema is undetermined.
      return {
        stageId: stage.id,
        output: stage.output,
        columns: [],
        inferred: true,
        unknown: true,
      };
    }
    case "UNPIVOT": {
      const cols = lookupColumnsByTableName(op.table, schema, prior);
      const idCols = op.idColumns.map<InferredColumn>(
        (name) =>
          cols.find((c) => c.name === name) ?? { name, type: "unknown" },
      );
      const meltedSourceType = guessMeltedType(op.valueColumns, cols);
      return {
        stageId: stage.id,
        output: stage.output,
        columns: [
          ...idCols,
          { name: op.nameColumn || "variable", type: "string" },
          { name: op.valueColumn || "value", type: meltedSourceType },
        ],
        inferred: true,
      };
    }
    case "LOOKUP": {
      const cols = lookupColumnsByTableName(op.table, schema, prior);
      if (op.outputType === "NEW_COLUMN") {
        const name = op.newColumnName || `${op.targetColumn || "lookup"}_mapped`;
        const exists = cols.some((c) => c.name === name);
        return {
          stageId: stage.id,
          output: stage.output,
          columns: exists
            ? cols
            : [...cols, { name, type: "string" }],
          inferred: true,
        };
      }
      // OVERWRITE: column shape unchanged.
      return {
        stageId: stage.id,
        output: stage.output,
        columns: cols,
        inferred: true,
      };
    }
    case "FORMULA": {
      const cols = lookupColumnsByTableName(op.table, schema, prior);
      const existingByName = new Map(cols.map((c) => [c.name, c]));
      for (const expr of op.expressions) {
        if (!expr.outputColumn) continue;
        existingByName.set(expr.outputColumn, {
          name: expr.outputColumn,
          type: guessFormulaType(expr.category),
        });
      }
      return {
        stageId: stage.id,
        output: stage.output,
        columns: Array.from(existingByName.values()),
        inferred: true,
      };
    }
    case "WINDOW": {
      const cols = lookupColumnsByTableName(op.table, schema, prior);
      const extras = op.operations
        .filter((o) => o.outputName)
        .map<InferredColumn>((o) => ({
          name: o.outputName,
          type: windowOpOutputType(o.fn),
        }));
      return {
        stageId: stage.id,
        output: stage.output,
        columns: [...cols, ...extras],
        inferred: true,
      };
    }
    case "CUSTOM":
      return {
        stageId: stage.id,
        output: stage.output,
        columns: [],
        inferred: true,
        unknown: true,
      };
  }
}

function guessMeltedType(
  valueColumns: string[],
  cols: InferredColumn[],
): ColumnType {
  const types = new Set<ColumnType>();
  for (const name of valueColumns) {
    const found = cols.find((c) => c.name === name);
    if (found) types.add(found.type);
  }
  if (types.size === 1) {
    const [only] = types;
    return only ?? "unknown";
  }
  return "unknown";
}

function lookupColumnsByTableName(
  tableName: string,
  schema: PipelineSchema,
  prior: InferredSchemaMap,
): InferredColumn[] {
  if (!tableName) return [];
  // Prefer a prior stage's output (most recent wins for same name).
  let fromStage: InferredColumn[] | null = null;
  for (const inf of prior.values()) {
    if (inf.output === tableName) fromStage = inf.columns;
  }
  if (fromStage) return fromStage;

  const dataset = schema.datasets[tableName];
  if (dataset) {
    return dataset.columns.map((c) => ({
      ...c,
      source: `${tableName}.${c.name}`,
    }));
  }
  return [];
}

function aggregateOutputType(fn: string): ColumnType {
  switch (fn) {
    case "COUNT":
      return "integer";
    case "SUM":
    case "AVG":
    case "MIN":
    case "MAX":
      return "float";
    default:
      return "unknown";
  }
}

function guessFormulaType(category: string): ColumnType {
  switch (category) {
    case "MATH":
      return "float";
    case "STRING":
      return "string";
    case "DATE":
      return "timestamp";
    default:
      return "unknown";
  }
}

function windowOpOutputType(fn: string): ColumnType {
  switch (fn) {
    case "RANK":
    case "DENSE_RANK":
    case "ROW_NUMBER":
      return "integer";
    case "SUM":
    case "AVG":
      return "float";
    case "LEAD":
    case "LAG":
      // Returns the same type as the source column; we don't know it here.
      return "unknown";
    default:
      return "unknown";
  }
}
