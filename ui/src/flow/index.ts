// Components
export { TransformationFlow } from "./components/flow/TransformationFlow";
export type { TransformationFlowProps, TransformationFlowHandle } from "./components/flow/TransformationFlow";
export { StageNode } from "./components/flow/StageNode";
export { FlowCanvasToolbar } from "./components/flow/FlowCanvasToolbar";
export type { FlowCanvasToolbarProps } from "./components/flow/FlowCanvasToolbar";
export type {
  StageEdgeHandleId,
} from "./components/flow/StageEdgeHandles";
export {
  STAGE_EDGE_HANDLE_IDS,
  DEFAULT_EDGE_SOURCE_HANDLE_ID,
  DEFAULT_EDGE_TARGET_HANDLE_ID,
  VALIDATE_PASS_HANDLE_ID,
  VALIDATE_FAIL_HANDLE_ID,
} from "./components/flow/StageEdgeHandles";
export { StageConfigUI } from "./components/config/StageConfigUI";
export { StageDetailsView } from "./components/config/StageDetailsView";
export { SaveFlowButton } from "./components/toolbar/SaveFlowButton";
export { AddStageMenu } from "./components/toolbar/AddStageMenu";
export { DataSchemaView } from "./components/views/DataSchemaView";
export type { DataSchemaViewProps } from "./components/views/DataSchemaView";
export { DataTableView } from "./components/views/DataTableView";
export type {
  DataTableViewProps,
  DataTableColumn,
} from "./components/views/DataTableView";
export { ResultsView } from "./components/views/ResultsView";
export type {
  ResultsViewProps,
  StageResult,
} from "./components/views/ResultsView";
export { JsonView } from "./components/views/JsonView";
export type { JsonViewProps } from "./components/views/JsonView";
export { PipelineIOPanel } from "./components/io/PipelineIOPanel";
export type {
  PipelineIOPanelProps,
  SamplePipelineEntry,
} from "./components/io/PipelineIOPanel";

// Types
export type {
  StageType,
  StageConfig,
  StageNodeData,
  FilterOperator,
  JoinType,
  SortDirection,
  AggregateFn,
  LoadConfig,
  FilterConfig,
  JoinConfig,
  UnionConfig,
  GroupConfig,
  GroupAggregation,
  SortConfig,
  SortOrder,
  SelectConfig,
  PivotConfig,
  UnpivotConfig,
  DedupeConfig,
  ValidateConfig,
  ValidateRule,
  LookupConfig,
  LookupEntry,
  LookupOutputMode,
  FormulaConfig,
  FormulaCategory,
  FormulaExpressionEntry,
  WindowConfig,
  WindowFn,
  WindowOperationEntry,
  CustomConfig,
  ExecutionState,
} from "./types/Pipeline";

export {
  STAGE_COLORS,
  STAGE_LABELS,
  TAG_COLORS,
  WINDOW_FNS_WITHOUT_TARGET,
  getStageColor,
  describeStageOperation,
  defaultConfigFor,
} from "./types/Pipeline";
export type { TagColor } from "./types/Pipeline";

// Schema
export type {
  PipelineSchema,
  SerializedStage,
  DatasetSchema,
  ColumnType,
  PipelineLayout,
  SerializeOptions,
  DeserializedPipeline,
  InferredColumn,
  StageOutputSchema,
  InferredSchemaMap,
  AIPipelineSchema,
  AIPipelineStage,
  FromAIOptions,
  UpstreamColumnsLookup,
} from "./Schema";

export {
  serializePipeline,
  deserializePipeline,
  validatePipelineSchema,
  inferOutputSchemas,
  buildColumnsLookup,
  toAISchema,
  fromAISchema,
  validateAIPipelineSchema,
} from "./Schema";


export type { SaveFlowButtonProps } from "./components/toolbar/SaveFlowButton";
