import type {
  DatasetSchema,
  PipelineSchema,
  SerializedStage,
} from "@flow";

/**
 * Source-table schemas matching the rows in `sampleData.ts`. Only these two
 * appear in `datasets` — intermediate stage outputs are inferred from the
 * upstream column lookup at render time.
 */
const CUSTOMERS_DATASET: DatasetSchema = {
  columns: [
    { name: "customer_id", type: "integer" },
    { name: "name", type: "string" },
    { name: "region", type: "string" },
    { name: "join_date", type: "date" },
    { name: "status", type: "string" },
  ],
};

const ORDERS_DATASET: DatasetSchema = {
  columns: [
    { name: "order_id", type: "integer" },
    { name: "customer_id", type: "integer" },
    { name: "product_category", type: "string" },
    { name: "amount", type: "float" },
    { name: "order_date", type: "date" },
  ],
};

// Shared LOAD stages used by both sample pipelines. Same ids on purpose so
// `SAMPLE_REVENUE_BY_REGION_RESULTS` works for both shapes.
const LOAD_CUSTOMERS_STAGE: SerializedStage = {
  id: "load_customers",
  name: "Load customers",
  type: "LOAD",
  depends_on: [],
  inputs: ["customers"],
  output: "customers",
  operation: {
    stageType: "LOAD",
    tableName: "customers",
    source: "customers.csv",
  },
};

const LOAD_ORDERS_STAGE: SerializedStage = {
  id: "load_orders",
  name: "Load orders",
  type: "LOAD",
  depends_on: [],
  inputs: ["orders"],
  output: "orders",
  operation: {
    stageType: "LOAD",
    tableName: "orders",
    source: "orders.csv",
  },
};

const DATASETS = {
  customers: CUSTOMERS_DATASET,
  orders: ORDERS_DATASET,
};

/**
 * "Two source tables" — the default starter. Two LOADs and nothing else, so
 * the user can either chat with Qwen to extend the pipeline or click the
 * "Show full pipeline" chip to jump to the canonical demo.
 */
export const SAMPLE_TWO_SOURCES_FLOW: PipelineSchema = {
  version: "1.0",
  pipeline: {
    name: "Two source tables",
    description:
      "Two LOAD nodes — customers and orders — sitting side by side. Build the rest by chatting with the agent.",
    createdAt: "2026-06-16T00:00:00.000Z",
  },
  datasets: DATASETS,
  stages: [LOAD_CUSTOMERS_STAGE, LOAD_ORDERS_STAGE],
  layout: {
    nodes: [
      { id: "load_customers", position: { x: 40, y: 40 } },
      { id: "load_orders", position: { x: 320, y: 40 } },
    ],
    edges: [],
  },
};

/**
 * "Revenue by region" — the full canonical pipeline. Same two LOADs as the
 * starter, plus an INNER JOIN on customer_id, a status='active' filter, and
 * a GROUP BY region with SUM(amount).
 *
 *   load_customers ─┐
 *                   ├─► join_orders_customers ─► filter_active ─► group_by_region
 *   load_orders   ──┘
 */
export const SAMPLE_REVENUE_BY_REGION_FLOW: PipelineSchema = {
  version: "1.0",
  pipeline: {
    name: "Revenue by region",
    description:
      "Join customers + orders, keep active customers only, then sum revenue per region.",
    createdAt: "2026-06-16T00:00:00.000Z",
  },
  datasets: DATASETS,
  stages: [
    LOAD_CUSTOMERS_STAGE,
    LOAD_ORDERS_STAGE,
    {
      id: "join_orders_customers",
      name: "Join orders ⋈ customers",
      type: "JOIN",
      depends_on: ["load_customers", "load_orders"],
      inputs: ["customers", "orders"],
      output: "customers_with_orders",
      operation: {
        stageType: "JOIN",
        joinType: "INNER",
        leftTable: "customers",
        rightTable: "orders",
        leftKey: "customer_id",
        rightKey: "customer_id",
      },
    },
    {
      id: "filter_active",
      name: "Keep active customers",
      type: "FILTER",
      depends_on: ["join_orders_customers"],
      inputs: ["customers_with_orders"],
      output: "active_customer_orders",
      operation: {
        stageType: "FILTER",
        table: "customers_with_orders",
        column: "status",
        operator: "=",
        value: "active",
      },
    },
    {
      id: "group_by_region",
      name: "Revenue per region",
      type: "GROUP",
      depends_on: ["filter_active"],
      inputs: ["active_customer_orders"],
      output: "revenue_by_region",
      operation: {
        stageType: "GROUP",
        table: "active_customer_orders",
        groupBy: ["region"],
        aggregations: [
          { fn: "SUM", column: "amount", alias: "total_revenue" },
        ],
      },
    },
  ],
  // Top-down layout. StageNode's default handles are Top (target) and Bottom
  // (source), so dataflow reads naturally as `y` increases. The two LOADs
  // sit side-by-side at the top, then merge into a single vertical chain.
  layout: {
    nodes: [
      { id: "load_customers", position: { x: 40, y: 40 } },
      { id: "load_orders", position: { x: 320, y: 40 } },
      { id: "join_orders_customers", position: { x: 180, y: 230 } },
      { id: "filter_active", position: { x: 180, y: 410 } },
      { id: "group_by_region", position: { x: 180, y: 590 } },
    ],
    edges: [
      {
        id: "e_load_customers__join",
        source: "load_customers",
        target: "join_orders_customers",
      },
      {
        id: "e_load_orders__join",
        source: "load_orders",
        target: "join_orders_customers",
      },
      {
        id: "e_join__filter",
        source: "join_orders_customers",
        target: "filter_active",
      },
      {
        id: "e_filter__group",
        source: "filter_active",
        target: "group_by_region",
      },
    ],
  },
};
