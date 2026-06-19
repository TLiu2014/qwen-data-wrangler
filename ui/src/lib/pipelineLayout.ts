import type { PipelineSchema } from "@flow";

/**
 * Top up `schema.layout` with derived edges and positions, MERGING with
 * anything already in the layout instead of bailing on "any entries
 * present". This matters for follow-up turns where `fromAISchema(ai, {base})`
 * preserves edges + positions for surviving stages — without merging, new
 * stages would arrive disconnected because the function used to short-circuit
 * the moment it saw an existing edge or node.
 *
 * - Edges: keep what's already there. Add any source→target pair derivable
 *   from a stage's `depends_on` or any `inputs` entry that matches another
 *   stage's `output`. Deduped on the source/target key.
 * - Positions: keep what's already there. For stages without a position,
 *   compute one via topological-depth layering using the merged edge set.
 */
export function layoutAIPipelineSchema(schema: PipelineSchema): PipelineSchema {
  // ── Edges ──
  const existingEdges = schema.layout.edges;
  const edgeKey = (source: string, target: string) => `${source}->${target}`;
  const seenEdgeKeys = new Set(
    existingEdges.map((e) => edgeKey(e.source, e.target)),
  );

  // Map: a stage's output → the id of the stage that produced it.
  const outputToStage = new Map<string, string>();
  for (const s of schema.stages) outputToStage.set(s.output, s.id);

  const derivedEdges: typeof schema.layout.edges = [];
  for (const stage of schema.stages) {
    const upstreamIds = new Set<string>();
    for (const input of stage.inputs ?? []) {
      const upstream = outputToStage.get(input);
      if (upstream && upstream !== stage.id) upstreamIds.add(upstream);
    }
    for (const dep of stage.depends_on ?? []) {
      if (dep && dep !== stage.id) upstreamIds.add(dep);
    }
    for (const source of upstreamIds) {
      const key = edgeKey(source, stage.id);
      if (seenEdgeKeys.has(key)) continue;
      seenEdgeKeys.add(key);
      derivedEdges.push({
        id: `e_${source}__${stage.id}`,
        source,
        target: stage.id,
      });
    }
  }

  const edges = [...existingEdges, ...derivedEdges];

  // ── Positions ──
  const existingPositions = new Map(
    schema.layout.nodes.map((n) => [n.id, n.position]),
  );
  const missing = schema.stages.filter((s) => !existingPositions.has(s.id));

  if (missing.length === 0) {
    // Everyone has a position already — just merge in the derived edges.
    return { ...schema, layout: { ...schema.layout, edges } };
  }

  // Depth = longest path from a root in the MERGED edge set. Cycle-guarded.
  const incoming = new Map<string, string[]>();
  for (const s of schema.stages) incoming.set(s.id, []);
  for (const e of edges) incoming.get(e.target)?.push(e.source);

  const depthCache = new Map<string, number>();
  const depthOf = (id: string, stack: Set<string>): number => {
    const cached = depthCache.get(id);
    if (cached !== undefined) return cached;
    if (stack.has(id)) return 0;
    stack.add(id);
    const parents = incoming.get(id) ?? [];
    const d =
      parents.length === 0
        ? 0
        : Math.max(...parents.map((p) => depthOf(p, stack) + 1));
    stack.delete(id);
    depthCache.set(id, d);
    return d;
  };
  for (const s of schema.stages) depthOf(s.id, new Set());

  const X_SPACING = 280;
  const Y_SPACING = 200;

  // Find the bounding box of existing positions so new nodes can be placed
  // RELATIVE to them — appending to the chain rather than overlapping it.
  let maxX = 40;
  let maxY = 40;
  for (const pos of existingPositions.values()) {
    if (pos.x > maxX) maxX = pos.x;
    if (pos.y > maxY) maxY = pos.y;
  }

  // For each "new" stage (no existing position), place by depth. Same-depth
  // peers are spread horizontally. The base x/y starts from the existing
  // bounding box so we don't pile on top of preserved nodes.
  const newByDepth = new Map<number, string[]>();
  for (const s of missing) {
    const d = depthCache.get(s.id) ?? 0;
    if (!newByDepth.has(d)) newByDepth.set(d, []);
    newByDepth.get(d)!.push(s.id);
  }

  const newPositions = new Map<string, { x: number; y: number }>();
  // Layout strategy: place new stages BELOW the existing bounding box (or to
  // the right of their depth peers if multiple at the same depth).
  for (const [depth, ids] of newByDepth) {
    ids.forEach((id, i) => {
      newPositions.set(id, {
        x: 40 + i * X_SPACING,
        // If there are existing nodes, push new ones below them.
        y: existingPositions.size > 0
          ? maxY + Y_SPACING + depth * Y_SPACING
          : 40 + depth * Y_SPACING,
      });
    });
  }

  const nodes = schema.stages.map((s) => ({
    id: s.id,
    position:
      existingPositions.get(s.id) ??
      newPositions.get(s.id) ?? { x: 40, y: 40 },
  }));

  return { ...schema, layout: { nodes, edges } };
}
