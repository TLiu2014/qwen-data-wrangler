import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  reconnectEdge,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react";

// Pencil/Eye icons used to drive the edit/view-only toggle that lived in
// this canvas. Toggle was removed — pipelines come from the agent — so the
// imports go too.
import { StageConfigUI } from "@flow/components/config/StageConfigUI";
import { FlowCanvasToolbar } from "@flow/components/flow/FlowCanvasToolbar";
import {
  buildColumnsLookup,
  deserializePipeline,
  serializePipeline,
  type PipelineSchema,
  type UpstreamColumnsLookup,
} from "@flow/Schema";
import { STAGE_LABELS, defaultConfigFor, getStageColor, type StageNodeData, type StageType } from "@flow/types/Pipeline";
import {
  DEFAULT_EDGE_SOURCE_HANDLE_ID,
  DEFAULT_EDGE_TARGET_HANDLE_ID,
} from "./StageEdgeHandles";
import { GradientEdge } from "./GradientEdge";
import { NodeToolbarPositionProvider } from "./NodeToolbarPositionContext";
import { PopoverStageDetails } from "./PopoverStageDetails";
import { PopoverStageEditor } from "./PopoverStageEditor";
import { StageDetailsView } from "@flow/components/config/StageDetailsView";
import { StageNode } from "./StageNode";
import {
  StageNodeContext,
  type NodeClassNameProvider,
  type StageNodeCallbacks,
} from "./StageNodeContext";

export interface TransformationFlowHandle {
  /** Adds a new stage node to the canvas and opens its edit form. */
  addStage: (stageType: StageType) => void;
  /** Step backward through the canvas's edit history. Returns true if something was undone. */
  undo: () => boolean;
  /** Step forward through the canvas's edit history. Returns true if something was redone. */
  redo: () => boolean;
}

export interface TransformationFlowProps {
  /**
   * Pipeline to load onto the canvas. When this reference changes (e.g. the
   * host loads a new sample), the canvas re-initializes. Changes caused by
   * the user editing the canvas do NOT trigger a reload — only genuinely new
   * schemas from outside do.
   */
  schema?: PipelineSchema | null;
  /** Fires after every meaningful user edit (drag-stop, connect, config save, delete). */
  onChange?: (schema: PipelineSchema) => void;
  /** Called when the user clicks a stage's output-table link. */
  onShowOutput?: (stageId: string) => void;
  /**
   * "popover" — the edit form floats next to the node on the canvas.
   * "panel"   — the edit form is pinned as a right sidebar.
   * Defaults to "popover".
   */
  configDisplayMode?: "popover" | "panel";
  confirmBeforeDelete?: boolean;
  /** When true, the canvas is view-only: no edits, no connections, no deletions. Node dragging is still allowed. */
  readOnly?: boolean;
  /** Extra classes for the outermost canvas wrapper. */
  className?: string;
  /**
   * Extra classes for every stage node's root. A function receives the node's
   * data and may return a class string that varies per stageType / config.
   */
  nodeClassName?: NodeClassNameProvider;
  /**
   * Extra classes for the gradient edge path. A function receives the Edge
   * and may return a string varying per source/target.
   */
  edgeClassName?: string | ((edge: Edge) => string | undefined);
  /**
   * When true, nodes show richer animated treatment for `executionState`
   * (pulsing ring while running, color ring on success/error). Default off.
   */
  richExecutionState?: boolean;
}

const nodeTypes: NodeTypes = { stageNode: StageNode };
const edgeTypes: EdgeTypes = { gradient: GradientEdge };

interface HistorySnapshot {
  nodes: Node<StageNodeData>[];
  edges: Edge[];
}

const HISTORY_LIMIT = 50;

function withDefaultHandles(e: Edge): Edge {
  return {
    ...e,
    sourceHandle: e.sourceHandle ?? DEFAULT_EDGE_SOURCE_HANDLE_ID,
    targetHandle: e.targetHandle ?? DEFAULT_EDGE_TARGET_HANDLE_ID,
  };
}

export const TransformationFlow = forwardRef<
  TransformationFlowHandle,
  TransformationFlowProps
>(function TransformationFlow(
  {
    schema,
    onChange,
    onShowOutput,
    configDisplayMode = "popover",
    confirmBeforeDelete = true,
    readOnly = false,
    className,
    nodeClassName,
    edgeClassName,
    richExecutionState,
  },
  ref,
) {
  const [nodes, setNodes] = useState<Node<StageNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [toolbarExpanded, setToolbarExpanded] = useState(true);
  const [popoverPosition, setPopoverPosition] = useState<Position>(Position.Right);
  // Always reflects the prop now that the in-canvas Edit toggle is gone.
  const isReadOnly = readOnly;
  // Reconnect constraints use refs so StageNode reads synchronously-set values
  // when useConnection triggers its re-render (zustand fires before React
  // flushes state, so state would arrive a render too late).
  const validReconnectNodeIdRef = useRef<string | null>(null);
  const selfLoopReconnectNodeIdRef = useRef<string | null>(null);

  // Refs always hold the latest render values — safe to use in callbacks.
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const pipelineNameRef = useRef(schema?.pipeline.name ?? "pipeline");
  nodesRef.current = nodes;
  edgesRef.current = edges;

  // Tracks the last schema we emitted so we don't re-init the canvas on our
  // own onChange round-trips from the host.
  const lastEmitted = useRef<PipelineSchema | null>(null);

  // ── Undo / redo history ─────────────────────────────────────────────────
  // Snapshots are taken in commit() before applying each user-driven change.
  // We don't snapshot during deserialize (loading a new schema clears history).
  const historyRef = useRef<{ past: HistorySnapshot[]; future: HistorySnapshot[] }>({
    past: [],
    future: [],
  });
  // Bumping a counter is the cheapest way to re-render undo/redo buttons
  // without storing the history in React state (which would force expensive
  // structural compares for every keystroke during color preview).
  const [, setHistoryVer] = useState(0);
  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;

  // Load (or reload) from the schema prop — only when it's a genuinely new
  // schema from outside, not one we emitted ourselves.
  useEffect(() => {
    if (!schema) return;
    if (schema === lastEmitted.current) return;
    const { name, nodes: newNodes, edges: newEdges } = deserializePipeline(schema);
    pipelineNameRef.current = name;
    setNodes(newNodes);
    // Resolve default handle IDs on load so emitted schemas are complete.
    setEdges(newEdges.map(withDefaultHandles));
    setSelectedNodeId(null);
    setEditingNodeId(null);
    // A fresh pipeline starts with a fresh history — preventing users from
    // "undoing" back into a pipeline they didn't author.
    historyRef.current = { past: [], future: [] };
    setHistoryVer((v) => v + 1);
  }, [schema]);

  const emit = useCallback(
    (emitNodes: Node<StageNodeData>[], emitEdges: Edge[]) => {
      if (!onChange) return;
      const s = serializePipeline(emitNodes, emitEdges, {
        name: pipelineNameRef.current,
      });
      lastEmitted.current = s;
      onChange(s);
    },
    [onChange],
  );

  /**
   * Records a snapshot of the previous (nodes, edges) before applying a new
   * one, then updates local state and emits. `coalesce: true` indicates a
   * transient preview (e.g. color picker swatch click) that should fold into
   * the prior history entry rather than create a new one.
   */
  const commit = useCallback(
    (
      nextNodes: Node<StageNodeData>[],
      nextEdges: Edge[],
      opts?: { coalesce?: boolean },
    ) => {
      const coalesce = opts?.coalesce ?? false;
      const prev: HistorySnapshot = {
        nodes: nodesRef.current,
        edges: edgesRef.current,
      };
      // Coalesced emits don't push a new entry — the prior "past" top remains
      // the pre-spree state. If history is empty (first edit), seed it so
      // undo has something to revert to.
      if (!coalesce) {
        const next = [...historyRef.current.past, prev];
        historyRef.current.past =
          next.length > HISTORY_LIMIT ? next.slice(-HISTORY_LIMIT) : next;
      } else if (historyRef.current.past.length === 0) {
        historyRef.current.past = [prev];
      }
      // Any new edit invalidates the redo branch.
      historyRef.current.future = [];
      setNodes(nextNodes);
      setEdges(nextEdges);
      emit(nextNodes, nextEdges);
      setHistoryVer((v) => v + 1);
    },
    [emit],
  );

  const undo = useCallback((): boolean => {
    const past = historyRef.current.past;
    if (past.length === 0) return false;
    const prev = past[past.length - 1];
    historyRef.current.past = past.slice(0, -1);
    historyRef.current.future = [
      { nodes: nodesRef.current, edges: edgesRef.current },
      ...historyRef.current.future,
    ];
    setNodes(prev.nodes);
    setEdges(prev.edges);
    emit(prev.nodes, prev.edges);
    setHistoryVer((v) => v + 1);
    return true;
  }, [emit]);

  const redo = useCallback((): boolean => {
    const future = historyRef.current.future;
    if (future.length === 0) return false;
    const next = future[0];
    historyRef.current.future = future.slice(1);
    historyRef.current.past = [
      ...historyRef.current.past,
      { nodes: nodesRef.current, edges: edgesRef.current },
    ];
    setNodes(next.nodes);
    setEdges(next.edges);
    emit(next.nodes, next.edges);
    setHistoryVer((v) => v + 1);
    return true;
  }, [emit]);

  // ── Canvas event handlers ────────────────────────────────────────────────

  const handleNodesChange = useCallback(
    (changes: NodeChange<Node<StageNodeData>>[]) => {
      const removes = changes.filter((c) => c.type === "remove");
      const others = changes.filter((c) => c.type !== "remove");

      if (removes.length > 0) {
        const removedIds = new Set(removes.map((c) => c.id));
        // Apply any non-remove changes first, then filter out removed nodes.
        const afterOthers =
          others.length > 0
            ? (applyNodeChanges(others, nodesRef.current) as Node<StageNodeData>[])
            : nodesRef.current;
        const newNodes = afterOthers.filter((n) => !removedIds.has(n.id));
        const newEdges = edgesRef.current.filter(
          (e) => !removedIds.has(e.source) && !removedIds.has(e.target),
        );
        setSelectedNodeId((cur) => (cur && removedIds.has(cur) ? null : cur));
        setEditingNodeId((cur) => (cur && removedIds.has(cur) ? null : cur));
        commit(newNodes, newEdges);
      } else {
        setNodes((ns) => applyNodeChanges(others, ns) as Node<StageNodeData>[]);
      }
    },
    [commit],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const removes = changes.filter((c) => c.type === "remove");
      const others = changes.filter((c) => c.type !== "remove");

      if (removes.length > 0) {
        const removedIds = new Set(removes.map((c) => c.id));
        const baseEdges =
          others.length > 0
            ? applyEdgeChanges(others, edgesRef.current)
            : edgesRef.current;
        const newEdges = baseEdges.filter((e) => !removedIds.has(e.id));
        commit(nodesRef.current, newEdges);
      } else {
        setEdges((es) => applyEdgeChanges(others, es));
      }
    },
    [commit],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (connection.source === connection.target) return;
      const newEdges = addEdge(
        withDefaultHandles({ ...connection, type: "gradient" } as Edge),
        edgesRef.current,
      );
      commit(nodesRef.current, newEdges);
    },
    [commit],
  );

  // Drag uses a snapshot taken at drag-start so the history records the
  // pre-drag positions (not the post-drag positions that nodesRef holds at
  // drag-stop). A null snapshot means no drag in progress.
  const dragSnapshotRef = useRef<HistorySnapshot | null>(null);

  const handleNodeDragStart = useCallback(() => {
    dragSnapshotRef.current = {
      nodes: nodesRef.current,
      edges: edgesRef.current,
    };
  }, []);

  const handleNodeDragStop = useCallback(() => {
    const prev = dragSnapshotRef.current;
    dragSnapshotRef.current = null;
    if (!prev) {
      emit(nodesRef.current, edgesRef.current);
      return;
    }
    // Click without movement: no nodes-array re-creation, skip history.
    if (prev.nodes === nodesRef.current && prev.edges === edgesRef.current) {
      return;
    }
    const next = [...historyRef.current.past, prev];
    historyRef.current.past =
      next.length > HISTORY_LIMIT ? next.slice(-HISTORY_LIMIT) : next;
    historyRef.current.future = [];
    setHistoryVer((v) => v + 1);
    emit(nodesRef.current, edgesRef.current);
  }, [emit]);

  const reconnectSucceeded = useRef(false);

  const handleReconnectStart = useCallback(
    (_: unknown, edge: Edge, handleType: "source" | "target") => {
      // React Flow's onReconnectStart passes handleType as the type of the
      // OPPOSITE/FIXED handle, not the one being dragged. So:
      // - handleType === 'target' → dragged side is source, fixed side is target
      // - handleType === 'source' → dragged side is target, fixed side is source
      // validRef = the dragged side's node (in view-only, the only valid target).
      // selfLoopRef = the fixed side's node (connecting dragged side here = self-loop).
      reconnectSucceeded.current = false;
      const draggedNodeId = handleType === "target" ? edge.source : edge.target;
      const fixedNodeId = handleType === "target" ? edge.target : edge.source;
      validReconnectNodeIdRef.current = isReadOnly ? draggedNodeId : null;
      selfLoopReconnectNodeIdRef.current = fixedNodeId;
    },
    [isReadOnly],
  );

  const isValidConnection = useCallback(
    (connection: Connection | Edge): boolean => {
      // During reconnect selfLoopReconnectNodeIdRef is non-null. React Flow
      // passes {source: drag-origin, target: hovered} so same-node handle
      // changes look like self-loops — return true and let StageNode's
      // reconnectInvalid (from refs) drive the shadow instead.
      if (selfLoopReconnectNodeIdRef.current != null) return true;
      // New connection drag: only reject self-loops.
      return connection.source !== connection.target;
    },
    [],
  );

  const handleReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      // Never allow self-loops.
      if (newConnection.source === newConnection.target) return;
      // In read-only mode only allow changing the handle side on the same node.
      if (
        isReadOnly &&
        (newConnection.source !== oldEdge.source ||
          newConnection.target !== oldEdge.target)
      ) {
        return;
      }
      reconnectSucceeded.current = true;
      const newEdges = reconnectEdge(oldEdge, newConnection, edgesRef.current);
      commit(nodesRef.current, newEdges);
    },
    [commit, isReadOnly],
  );

  const handleReconnectEnd = useCallback((_: unknown, edge: Edge) => {
    if (!reconnectSucceeded.current) {
      // Drag dropped to nothing or rejected — restore the edge if React Flow
      // removed it via onEdgesChange. Restoration is not a user-driven edit,
      // so we patch local state directly without going through commit().
      setEdges((prev) =>
        prev.some((e) => e.id === edge.id) ? prev : [...prev, edge],
      );
    }
    reconnectSucceeded.current = false;
    validReconnectNodeIdRef.current = null;
    selfLoopReconnectNodeIdRef.current = null;
  }, []);

  // ── Keyboard shortcuts: Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+Z (or Y) redo ───
  useEffect(() => {
    if (isReadOnly) return;
    const handler = (e: KeyboardEvent) => {
      // Defer to native undo when focus is in a form field — the user is
      // editing text, not the canvas.
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          (t as HTMLElement).isContentEditable)
      ) {
        return;
      }
      const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        if (undo()) e.preventDefault();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        if (redo()) e.preventDefault();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [undo, redo, isReadOnly]);

  // ── Node interaction ─────────────────────────────────────────────────────

  const handleNodeClick = (node: Node<StageNodeData>) => {
    setSelectedNodeId(node.id);
    // In panel mode, a single click focuses the node in the side panel
    // (editor when editing, details when view-only). Popover mode requires
    // an explicit double-click or icon button.
    if (configDisplayMode === "panel") setEditingNodeId(node.id);
  };

  const handleNodeDoubleClick = (node: Node<StageNodeData>) => {
    setSelectedNodeId(node.id);
    // Double-click works in both edit and view-only modes — the overlay it
    // opens just renders differently per mode.
    setEditingNodeId(node.id);
  };

  const handlePaneClick = () => {
    setSelectedNodeId(null);
    if (configDisplayMode !== "popover") setEditingNodeId(null);
  };

  const handleEditNode = (stageId: string) => {
    setSelectedNodeId(stageId);
    setEditingNodeId(stageId);
  };

  // Same target as handleEditNode — symmetric entry point from the node's
  // eye icon in view-only mode. Kept as a distinct name so future divergence
  // (e.g. analytics) doesn't bleed into edit-mode handling.
  const handleShowDetailsNode = (stageId: string) => {
    setSelectedNodeId(stageId);
    setEditingNodeId(stageId);
  };

  // ── Config panel mutations ───────────────────────────────────────────────

  const handleUpdateNode = useCallback(
    (id: string, patch: Partial<StageNodeData>) => {
      const newNodes = nodesRef.current.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
      );
      // Color-only patches are transient previews (the color picker writes
      // one per swatch click). Coalesce them so the user gets one undo step
      // per editor session, not one per click.
      const isColorPreview =
        Object.keys(patch).length === 1 && "color" in patch;
      commit(newNodes, edgesRef.current, { coalesce: isColorPreview });
    },
    [commit],
  );

  const handleDelete = useCallback(
    (id: string) => {
      const newNodes = nodesRef.current.filter((n) => n.id !== id);
      const newEdges = edgesRef.current.filter(
        (e) => e.source !== id && e.target !== id,
      );
      setSelectedNodeId((cur) => (cur === id ? null : cur));
      setEditingNodeId((cur) => (cur === id ? null : cur));
      commit(newNodes, newEdges);
    },
    [commit],
  );

  // ── Imperative handle (addStage) ─────────────────────────────────────────

  const addStage = useCallback(
    (stageType: StageType) => {
      const id = `n${Date.now().toString(36)}`;
      const stageIndex = nodesRef.current.length + 1;
      const newNode: Node<StageNodeData> = {
        id,
        type: "stageNode",
        position: {
          x: 80 + (stageIndex % 3) * 60,
          y: 80 + stageIndex * 80,
        },
        data: {
          stageType,
          label: `${STAGE_LABELS[stageType]} #${stageIndex}`,
          stageIndex,
          config: defaultConfigFor(stageType),
          outputTableName: `${stageType.toLowerCase()}_${stageIndex}`,
        },
      };
      const newNodes = [...nodesRef.current, newNode];
      setSelectedNodeId(id);
      setEditingNodeId(id);
      commit(newNodes, edgesRef.current);
    },
    [commit],
  );

  useImperativeHandle(
    ref,
    () => ({ addStage, undo, redo }),
    [addStage, undo, redo],
  );

  // ── Derived state for render ─────────────────────────────────────────────

  const editingNode = useMemo(
    () => nodes.find((n) => n.id === editingNodeId) ?? null,
    [nodes, editingNodeId],
  );

  // Column-aware editor support: rebuild lookup whenever the canvas changes
  // so dropdowns reflect the live (saved) schema. Cheap to recompute since
  // inferOutputSchemas walks stages linearly.
  const columnsLookup = useMemo<UpstreamColumnsLookup>(() => {
    const liveSchema = serializePipeline(nodes, edges, {
      name: pipelineNameRef.current,
    });
    return buildColumnsLookup(liveSchema);
  }, [nodes, edges]);

  const decoratedNodes = useMemo(
    () => nodes.map((n) => ({ ...n, selected: n.id === selectedNodeId })),
    [nodes, selectedNodeId],
  );

  const callbacks = useMemo<StageNodeCallbacks>(
    () => ({
      onShowOutput,
      onEdit: isReadOnly ? undefined : handleEditNode,
      onShowDetails: isReadOnly ? handleShowDetailsNode : undefined,
      readOnly: isReadOnly,
      validReconnectNodeIdRef,
      selfLoopReconnectNodeIdRef,
      nodeClassName,
      richExecutionState,
      edgeClassName,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onShowOutput, isReadOnly, nodeClassName, richExecutionState, edgeClassName],
  );

  return (
    <StageNodeContext.Provider value={callbacks}>
      <NodeToolbarPositionProvider value={popoverPosition}>
        <div className={`flex h-full min-h-[480px] ${className ?? ""}`}>
          <div className="relative min-w-0 flex-1">
            {/* App-level decision: pipelines come from the agent, not from
                manual canvas editing — so the read-only / edit toggle that
                lived here is gone. `readOnly` is enforced by the prop and
                cannot be flipped from inside the canvas. */}
            {!isReadOnly && (
              <div className="pointer-events-none absolute left-2 top-12 z-20 flex max-w-[min(100%-1rem,18rem)] flex-col gap-1">
                <FlowCanvasToolbar
                  expanded={toolbarExpanded}
                  onExpandedChange={setToolbarExpanded}
                  editPanelPosition={popoverPosition}
                  onEditPanelPositionChange={setPopoverPosition}
                  onAddStage={addStage}
                  canUndo={canUndo}
                  canRedo={canRedo}
                  onUndo={undo}
                  onRedo={redo}
                />
              </div>
            )}
            <ReactFlow
              nodes={decoratedNodes}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={isReadOnly ? undefined : handleConnect}
              isValidConnection={isValidConnection}
              onReconnectStart={handleReconnectStart}
              onReconnect={handleReconnect}
              onReconnectEnd={handleReconnectEnd}
              onNodeClick={(_, node) => handleNodeClick(node as Node<StageNodeData>)}
              onNodeDoubleClick={(_, node) => handleNodeDoubleClick(node as Node<StageNodeData>)}
              onNodeDragStart={handleNodeDragStart}
              onNodeDragStop={handleNodeDragStop}
              onPaneClick={handlePaneClick}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultEdgeOptions={{ type: "gradient" }}
              connectionMode={ConnectionMode.Loose}
              deleteKeyCode={isReadOnly ? null : "Delete"}
              onInit={(instance) =>
                requestAnimationFrame(() => instance.fitView({ padding: 0.1 }))
              }
              proOptions={{ hideAttribution: true }}
              className="h-full w-full"
            >
              <Background color="#e5e7eb" gap={16} />
              <Controls className="!shadow-md" />
              <MiniMap
                pannable
                zoomable
                nodeColor={(n) => {
                  const data = n.data as StageNodeData | undefined;
                  return data ? getStageColor(data) : "#9ca3af";
                }}
                className="!bg-white dark:bg-gray-900"
              />
              {configDisplayMode === "popover" && editingNode && (
                isReadOnly ? (
                  <PopoverStageDetails
                    node={editingNode}
                    onClose={() => setEditingNodeId(null)}
                  />
                ) : (
                  <PopoverStageEditor
                    node={editingNode}
                    onUpdate={handleUpdateNode}
                    onDelete={handleDelete}
                    onCancel={() => setEditingNodeId(null)}
                    confirmBeforeDelete={confirmBeforeDelete}
                    columnsLookup={columnsLookup}
                  />
                )
              )}
            </ReactFlow>
          </div>

          {configDisplayMode === "panel" && (
            isReadOnly ? (
              editingNode && (
                <div className="flex w-80 shrink-0 flex-col overflow-hidden border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                  <StageDetailsView
                    node={editingNode}
                    onClose={() => setEditingNodeId(null)}
                  />
                </div>
              )
            ) : (
              <div className="flex w-80 shrink-0 flex-col overflow-hidden border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                <StageConfigUI
                  node={editingNode}
                  onUpdate={(id, patch) => {
                    handleUpdateNode(id, patch);
                    setEditingNodeId(null);
                  }}
                  onDelete={handleDelete}
                  onCancel={() => setEditingNodeId(null)}
                  confirmBeforeDelete={confirmBeforeDelete}
                  columnsLookup={columnsLookup}
                />
              </div>
            )
          )}
        </div>
      </NodeToolbarPositionProvider>
    </StageNodeContext.Provider>
  );
});
