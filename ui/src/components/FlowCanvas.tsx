import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { useEffect } from "react";
import { TransformationFlow, type PipelineSchema } from "@flow";

export interface FlowCanvasProps {
  schema: PipelineSchema | null;
  /** Called when a stage node's output-table link is clicked. */
  onShowOutput?: (stageId: string) => void;
}

/**
 * Read-only canvas. The user can pan/zoom but not edit — generation is
 * driven by the chat input, not by hand-editing nodes.
 *
 * `TransformationFlow` is rendered only when `schema` is non-null because
 * the lib's load-schema effect is a no-op on null (it preserves whatever's
 * already on the canvas). Conditionally rendering forces a clean unmount on
 * "hide sample" toggles so the canvas actually empties.
 */
export function FlowCanvas({ schema, onShowOutput }: FlowCanvasProps) {
  return (
    <div className="relative h-full w-full">
      {schema ? (
        <ReactFlowProvider>
          <TransformationFlow
            schema={schema}
            readOnly
            configDisplayMode="popover"
            onShowOutput={onShowOutput}
            className="h-full w-full"
          />
          <ViewportFitter schema={schema} />
        </ReactFlowProvider>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-lg border border-dashed border-slate-300 bg-white/80 px-6 py-4 text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300">
            Describe a transformation in the chat box below — the generated
            pipeline will render here.
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Re-runs ReactFlow's `fitView` every time a new schema reference lands.
 * The lib only calls fitView on the initial mount; subsequent schema swaps
 * leave the viewport stuck on the old pipeline's coordinates. We wait one
 * animation frame so the lib's "deserialize new schema → setNodes" effect
 * runs first, then fit to whatever just got placed.
 */
function ViewportFitter({ schema }: { schema: PipelineSchema }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      fitView({ padding: 0.15, duration: 350 });
    });
    return () => cancelAnimationFrame(id);
  }, [schema, fitView]);
  return null;
}
