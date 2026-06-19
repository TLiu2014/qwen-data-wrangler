import type {
  FilterConfig,
  GroupConfig,
  JoinConfig,
  LoadConfig,
  PipelineSchema,
  SelectConfig,
  SerializedStage,
  SortConfig,
  UnionConfig,
} from "@flow";

/**
 * Translate one stage into a `CREATE OR REPLACE VIEW <output> AS …` statement.
 * Returns `null` for stage types the browser engine doesn't yet support — the
 * caller renders an empty StageResult and the report copy explains the gap.
 *
 * Identifiers are double-quoted so reserved words / mixed-case names work.
 * Filter values are numeric-passthrough when they parse as numbers, otherwise
 * single-quoted with embedded apostrophes doubled.
 */
export function stageToSql(stage: SerializedStage): string | null {
  const op = stage.operation;
  const out = quoteIdent(stage.output);

  switch (op.stageType) {
    case "LOAD": {
      const load = op as LoadConfig;
      const sourceName = load.tableName || stage.output;
      // When the LOAD's output is the SAME name as the underlying table, the
      // table itself already satisfies downstream `FROM <output>` references.
      // Creating a view of the same name conflicts with the existing table
      // ("Catalog: name conflicts with type 'TABLE'"), the catch in the
      // executor swallows it, and the tab ends up blank. NOP for these LOADs.
      if (sourceName === stage.output) return `SELECT 0 WHERE FALSE;`;
      return `CREATE OR REPLACE VIEW ${out} AS SELECT * FROM ${quoteIdent(sourceName)};`;
    }
    case "FILTER": {
      const f = op as FilterConfig;
      const col = quoteIdent(f.column);
      const operator = f.operator;
      const value = formatValue(f.value);
      const table = quoteIdent(f.table);
      return `CREATE OR REPLACE VIEW ${out} AS SELECT * FROM ${table} WHERE ${col} ${operator} ${value};`;
    }
    case "JOIN": {
      const j = op as JoinConfig;
      const left = quoteIdent(j.leftTable);
      const right = quoteIdent(j.rightTable);
      const lk = quoteIdent(j.leftKey);
      const rk = quoteIdent(j.rightKey);
      const joinKind =
        j.joinType === "FULL OUTER"
          ? "FULL OUTER JOIN"
          : `${j.joinType} JOIN`;
      // Drop the right-side join key to mimic typical projections (matches
      // the lib's inferOutputSchemas convention for joined columns).
      return `CREATE OR REPLACE VIEW ${out} AS SELECT ${left}.*, ${right}.* EXCLUDE (${rk}) FROM ${left} ${joinKind} ${right} ON ${left}.${lk} = ${right}.${rk};`;
    }
    case "GROUP": {
      const g = op as GroupConfig;
      const table = quoteIdent(g.table);
      const groupCols = g.groupBy.map(quoteIdent);
      const aggs = g.aggregations.map((a) => {
        const fn = a.fn;
        const col = quoteIdent(a.column);
        const alias = quoteIdent(
          a.alias || `${a.fn.toLowerCase()}_${a.column}`,
        );
        return `${fn}(${col}) AS ${alias}`;
      });
      const projection = [...groupCols, ...aggs].join(", ");
      const groupBy = groupCols.length > 0 ? ` GROUP BY ${groupCols.join(", ")}` : "";
      return `CREATE OR REPLACE VIEW ${out} AS SELECT ${projection} FROM ${table}${groupBy};`;
    }
    case "SORT": {
      const s = op as SortConfig;
      const table = quoteIdent(s.table);
      const order = s.orderBy
        .map((o) => `${quoteIdent(o.column)} ${o.direction}`)
        .join(", ");
      return `CREATE OR REPLACE VIEW ${out} AS SELECT * FROM ${table} ORDER BY ${order};`;
    }
    case "SELECT": {
      const s = op as SelectConfig;
      const table = quoteIdent(s.table);
      const cols = s.columns.length > 0 ? s.columns.map(quoteIdent).join(", ") : "*";
      return `CREATE OR REPLACE VIEW ${out} AS SELECT ${cols} FROM ${table};`;
    }
    case "UNION": {
      const u = op as UnionConfig;
      const sep = u.unionAll ? " UNION ALL " : " UNION ";
      const parts = u.tables.map((t) => `SELECT * FROM ${quoteIdent(t)}`);
      return `CREATE OR REPLACE VIEW ${out} AS ${parts.join(sep)};`;
    }
    case "DEDUPE":
    case "PIVOT":
    case "UNPIVOT":
    case "VALIDATE":
    case "LOOKUP":
    case "FORMULA":
    case "WINDOW":
    case "CUSTOM":
      // Not yet supported by the browser engine. The caller logs and shows
      // the lib's empty-state for these stage tabs.
      return null;
  }
}

/**
 * Topological order: stages emit before any stage that depends on them. Uses
 * Kahn's algorithm over the `depends_on` adjacency. Stable on ties (matches
 * the original `schema.stages` order). Cycle-safe — orphans appended at end.
 */
export function topologicalOrder(schema: PipelineSchema): SerializedStage[] {
  const byId = new Map(schema.stages.map((s) => [s.id, s]));
  const indeg = new Map<string, number>(schema.stages.map((s) => [s.id, 0]));
  const adj = new Map<string, string[]>(schema.stages.map((s) => [s.id, []]));
  for (const s of schema.stages) {
    for (const dep of s.depends_on ?? []) {
      if (!indeg.has(dep)) continue;
      adj.get(dep)!.push(s.id);
      indeg.set(s.id, (indeg.get(s.id) ?? 0) + 1);
    }
  }
  const queue: string[] = [];
  for (const s of schema.stages) if ((indeg.get(s.id) ?? 0) === 0) queue.push(s.id);

  const out: SerializedStage[] = [];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(byId.get(id)!);
    for (const next of adj.get(id) ?? []) {
      indeg.set(next, (indeg.get(next) ?? 0) - 1);
      if ((indeg.get(next) ?? 0) === 0) queue.push(next);
    }
  }
  // Cycle/orphan fallback
  if (out.length < schema.stages.length) {
    for (const s of schema.stages) if (!seen.has(s.id)) out.push(s);
  }
  return out;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function formatValue(raw: string): string {
  if (/^-?\d+(\.\d+)?$/.test(raw)) return raw;
  return `'${raw.replace(/'/g, "''")}'`;
}
