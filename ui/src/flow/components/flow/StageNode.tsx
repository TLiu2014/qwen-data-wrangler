import { memo } from "react";
import { Handle, Position, useConnection, type Node, type NodeProps } from "@xyflow/react";
import {
  Filter,
  GitMerge,
  Layers,
  ArrowDownAZ,
  Columns3,
  Database,
  FunctionSquare,
  Code2,
  ExternalLink,
  Eye,
  Info,
  Pencil,
  Table2,
  Split,
  CopyMinus,
  ShieldCheck,
  ArrowRightLeft,
  Sigma,
  TrendingUp,
} from "lucide-react";
import type { StageNodeData, StageType } from "@flow/types/Pipeline";
import { describeStageOperation, getStageColor } from "@flow/types/Pipeline";
import { cn } from "@flow/lib/Utils";
import { STAGE_EDGE_HANDLE_IDS, VALIDATE_FAIL_HANDLE_ID, VALIDATE_PASS_HANDLE_ID } from "./StageEdgeHandles";
import { useStageNodeCallbacks } from "./StageNodeContext";

const STAGE_ICONS: Record<StageType, typeof Filter> = {
  LOAD: Database,
  FILTER: Filter,
  JOIN: GitMerge,
  UNION: Layers,
  GROUP: FunctionSquare,
  SORT: ArrowDownAZ,
  SELECT: Columns3,
  PIVOT: Table2,
  UNPIVOT: Split,
  DEDUPE: CopyMinus,
  VALIDATE: ShieldCheck,
  LOOKUP: ArrowRightLeft,
  FORMULA: Sigma,
  WINDOW: TrendingUp,
  CUSTOM: Code2,
};

const EXEC_BADGE: Record<NonNullable<StageNodeData["executionState"]>, string> = {
  pending: "bg-amber-50 text-amber-700",
  running: "bg-blue-50 text-blue-700 animate-pulse",
  success: "bg-emerald-50 text-emerald-700",
  error: "bg-red-50 text-red-700",
};

type StageNodeType = Node<StageNodeData, "stageNode">;

function StageNodeImpl({ id, data, selected }: NodeProps<StageNodeType>) {
  const color = getStageColor(data);
  const Icon = STAGE_ICONS[data.stageType];
  const {
    onShowOutput,
    onEdit,
    onShowDetails,
    readOnly,
    validReconnectNodeIdRef,
    selfLoopReconnectNodeIdRef,
    nodeClassName,
    richExecutionState,
  } = useStageNodeCallbacks();
  const extraClass =
    typeof nodeClassName === "function"
      ? (nodeClassName(data) ?? "")
      : (nodeClassName ?? "");
  const execRingClass =
    richExecutionState && data.executionState
      ? data.executionState === "running"
        ? "ring-2 ring-blue-400 animate-pulse"
        : data.executionState === "success"
          ? "ring-2 ring-emerald-400"
          : data.executionState === "error"
            ? "ring-2 ring-red-400"
            : data.executionState === "pending"
              ? "ring-2 ring-amber-300"
              : ""
      : "";
  const activeConnection = useConnection((connection) => ({
    inProgress: connection.inProgress,
    isValid: connection.isValid,
    toNodeId: connection.toHandle?.nodeId ?? null,
    toHandleId: connection.toHandle?.id ?? null,
  }));

  // Read refs synchronously — they are written in handleReconnectStart before
  // zustand fires useConnection, so these values are always current here.
  const reconnectInvalid =
    (validReconnectNodeIdRef?.current != null && id !== validReconnectNodeIdRef.current) ||
    (selfLoopReconnectNodeIdRef?.current != null && id === selfLoopReconnectNodeIdRef.current);
  const reconnectInProgress =
    validReconnectNodeIdRef?.current != null ||
    selfLoopReconnectNodeIdRef?.current != null;

  const handleCls =
    "!h-2.5 !w-2.5 !border-2 !border-gray-300 dark:border-gray-600 !bg-white dark:bg-gray-900 transition-colors hover:!border-blue-400 hover:!bg-blue-50";

  const getHandleSide = (handleId: string) => handleId.split("-")[0];

  const approachingSide = activeConnection.toHandleId
    ? getHandleSide(activeConnection.toHandleId)
    : null;

  const getHandleClassName = (handleId: string) => {
    const isApproaching =
      activeConnection.inProgress &&
      activeConnection.toNodeId === id &&
      approachingSide === getHandleSide(handleId);

    if (!isApproaching) {
      return handleCls;
    }

    if (reconnectInProgress) {
      return `${handleCls} tfu-handle-approaching ${
        reconnectInvalid ? "tfu-handle-invalid" : "tfu-handle-valid"
      }`;
    }

    if (activeConnection.isValid == null) {
      return handleCls;
    }

    return `${handleCls} tfu-handle-approaching ${
      reconnectInvalid || activeConnection.isValid === false
        ? "tfu-handle-invalid"
        : "tfu-handle-valid"
    }`;
  };

  const h = STAGE_EDGE_HANDLE_IDS;
  const isValidate = data.stageType === "VALIDATE";

  return (
    <div
      className={cn(
        "relative min-w-[200px] rounded-md border-2 bg-white dark:bg-gray-900 p-3 shadow-sm transition-shadow",
        selected ? "ring-2 ring-blue-400 ring-offset-2" : "hover:shadow-md",
        execRingClass,
        extraClass,
      )}
      style={{ borderColor: color }}
    >
      {isValidate ? (
        // Validate routes rows to Pass/Fail outputs. Single input on the left,
        // two labeled outputs stacked on the right.
        <>
          <Handle
            id={h.leftIn}
            type="target"
            position={Position.Left}
            className={`${getHandleClassName(h.leftIn)} z-[1]`}
            style={{ top: "50%" }}
          />
          <Handle
            id={VALIDATE_PASS_HANDLE_ID}
            type="source"
            position={Position.Right}
            className={`${getHandleClassName(VALIDATE_PASS_HANDLE_ID)} z-[2] !border-emerald-500 !bg-emerald-50`}
            style={{ top: "32%" }}
          />
          <Handle
            id={VALIDATE_FAIL_HANDLE_ID}
            type="source"
            position={Position.Right}
            className={`${getHandleClassName(VALIDATE_FAIL_HANDLE_ID)} z-[2] !border-red-500 !bg-red-50`}
            style={{ top: "68%" }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute right-2 top-[32%] -translate-y-1/2 rounded bg-emerald-50 px-1 text-[9px] font-semibold tracking-wide text-emerald-700"
          >
            PASS
          </span>
          <span
            aria-hidden
            className="pointer-events-none absolute right-2 top-[68%] -translate-y-1/2 rounded bg-red-50 px-1 text-[9px] font-semibold tracking-wide text-red-700"
          >
            FAIL
          </span>
        </>
      ) : (
        <>
          {/* One visual dot per side: React Flow still needs separate target + source
              handles; stacked at the same spot so only one connector shows. */}
          <Handle
            id={h.topIn}
            type="target"
            position={Position.Top}
            className={`${getHandleClassName(h.topIn)} z-[1]`}
            style={{ left: "50%" }}
          />
          <Handle
            id={h.topOut}
            type="source"
            position={Position.Top}
            className={`${getHandleClassName(h.topOut)} z-[2]`}
            style={{ left: "50%" }}
          />

          <Handle
            id={h.bottomIn}
            type="target"
            position={Position.Bottom}
            className={`${getHandleClassName(h.bottomIn)} z-[1]`}
            style={{ left: "50%" }}
          />
          <Handle
            id={h.bottomOut}
            type="source"
            position={Position.Bottom}
            className={`${getHandleClassName(h.bottomOut)} z-[2]`}
            style={{ left: "50%" }}
          />

          <Handle
            id={h.leftIn}
            type="target"
            position={Position.Left}
            className={`${getHandleClassName(h.leftIn)} z-[1]`}
            style={{ top: "50%" }}
          />
          <Handle
            id={h.leftOut}
            type="source"
            position={Position.Left}
            className={`${getHandleClassName(h.leftOut)} z-[2]`}
            style={{ top: "50%" }}
          />

          <Handle
            id={h.rightIn}
            type="target"
            position={Position.Right}
            className={`${getHandleClassName(h.rightIn)} z-[1]`}
            style={{ top: "50%" }}
          />
          <Handle
            id={h.rightOut}
            type="source"
            position={Position.Right}
            className={`${getHandleClassName(h.rightOut)} z-[2]`}
            style={{ top: "50%" }}
          />
        </>
      )}

      <div className="flex items-start gap-2">
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: color }}
        >
          <Icon className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "text-xs font-semibold tracking-wide",
                !data.displayType && "uppercase",
              )}
              style={{ color }}
            >
              {data.displayType || data.stageType}
            </span>
            <div className="flex items-center gap-1">
              <span
                title={describeStageOperation(data.config)}
                aria-label={describeStageOperation(data.config)}
                className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <Info className="h-3 w-3" />
              </span>
              <span className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:text-gray-400 dark:text-gray-500">
                #{data.stageIndex}
              </span>
              {onEdit && !readOnly && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(id);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  title="Edit stage (or double-click the node)"
                  aria-label="Edit stage"
                  className="inline-flex h-5 w-5 items-center justify-center rounded text-gray-500 dark:text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
              {onShowDetails && readOnly && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onShowDetails(id);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  title="View stage details (or double-click the node)"
                  aria-label="View stage details"
                  className="inline-flex h-5 w-5 items-center justify-center rounded text-gray-500 dark:text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  <Eye className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
          <div className="mt-1 truncate text-sm text-gray-800 dark:text-gray-200">{data.label}</div>
          {data.outputTableName && (
            onShowOutput ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onShowOutput(id);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                title={`View ${data.outputTableName} schema`}
                className="mt-1 inline-flex max-w-full items-center gap-1 truncate rounded text-[11px] text-blue-600 hover:text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                <span className="truncate">→ {data.outputTableName}</span>
                <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
              </button>
            ) : (
              <div className="mt-1 truncate text-[11px] text-gray-500 dark:text-gray-400 dark:text-gray-500">
                → {data.outputTableName}
              </div>
            )
          )}
          {data.executionState && (
            <span
              className={cn(
                "mt-2 inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                EXEC_BADGE[data.executionState],
              )}
            >
              {data.executionState}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export const StageNode = memo(StageNodeImpl);
