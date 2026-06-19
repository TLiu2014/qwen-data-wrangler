import { type MutableRefObject, createContext, useContext } from "react";
import type { StageNodeData } from "@flow/types/Pipeline";

export type NodeClassNameProvider =
  | string
  | ((data: StageNodeData) => string | undefined);

export interface StageNodeCallbacks {
  /**
   * Called when the user clicks a node's output-table link. The library does
   * not interpret this — typical wiring is to switch a "Data Schema" tab to
   * the matching stage.
   */
  onShowOutput?: (stageId: string) => void;
  /**
   * Called when the user clicks the per-node edit (pencil) icon. Distinct
   * from a plain node click — clients use this to open an edit form even
   * when single-click selection is suppressed (e.g. popover edit mode).
   */
  onEdit?: (stageId: string) => void;
  /**
   * Called when the user clicks the per-node details (eye) icon in view-only
   * mode. Symmetric with onEdit but for read-only inspection.
   */
  onShowDetails?: (stageId: string) => void;
  /** When true, editing/deleting controls are hidden throughout the canvas. */
  readOnly?: boolean;
  /**
   * Ref to the only node whose handles are valid during a view-only reconnect
   * drag. Null outside a drag or in edit mode. Passed as a ref so StageNode
   * always reads the synchronously-set value from handleReconnectStart.
   */
  validReconnectNodeIdRef?: MutableRefObject<string | null>;
  /**
   * Ref to the node that would create a self-loop during any reconnect drag —
   * always an invalid target. Null outside an active drag.
   */
  selfLoopReconnectNodeIdRef?: MutableRefObject<string | null>;
  /**
   * Optional caller-supplied extra classes for every stage node's root.
   * Strings are appended verbatim; functions can vary per stage by reading
   * `data.stageType`, `data.config.stageType`, etc.
   */
  nodeClassName?: NodeClassNameProvider;
  /** When true, the lib applies richer animated treatment to executionState. */
  richExecutionState?: boolean;
  /** Caller-supplied extra classes for the edge SVG path. */
  edgeClassName?: string | ((edge: { id: string; source: string; target: string }) => string | undefined);
}

export const StageNodeContext = createContext<StageNodeCallbacks>({});

export function useStageNodeCallbacks(): StageNodeCallbacks {
  return useContext(StageNodeContext);
}
