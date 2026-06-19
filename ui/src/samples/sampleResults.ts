import type { StageResult } from "@flow";

/**
 * Pre-computed per-stage result rows for `SAMPLE_REVENUE_BY_REGION_FLOW`.
 * The MVP doesn't execute SQL, so these are hand-derived from the CSVs in
 * `sampleData.ts`:
 *
 *   load_*         → raw rows from each table
 *   join           → inner join customers ⋈ orders ON customer_id
 *   filter_active  → join WHERE status = 'active'
 *   group_by_region→ SUM(amount) GROUP BY region
 *
 * Keys MUST match the stage ids in sampleFlow.ts.
 */

const CUSTOMER_ROWS = [
  { customer_id: 1, name: "Alice Johnson", region: "North", join_date: "2023-01-15", status: "active" },
  { customer_id: 2, name: "Bob Smith",     region: "South", join_date: "2023-03-22", status: "active" },
  { customer_id: 3, name: "Carol White",   region: "East",  join_date: "2023-06-10", status: "inactive" },
  { customer_id: 4, name: "David Brown",   region: "West",  join_date: "2023-07-04", status: "active" },
  { customer_id: 5, name: "Eve Davis",     region: "North", join_date: "2023-09-18", status: "active" },
  { customer_id: 6, name: "Frank Miller",  region: "South", join_date: "2024-01-05", status: "inactive" },
  { customer_id: 7, name: "Grace Wilson",  region: "East",  join_date: "2024-02-14", status: "active" },
];

const ORDER_ROWS = [
  { order_id: 101, customer_id: 1, product_category: "Electronics", amount: 299.99, order_date: "2024-01-10" },
  { order_id: 102, customer_id: 2, product_category: "Books",       amount: 45.50,  order_date: "2024-01-12" },
  { order_id: 103, customer_id: 1, product_category: "Clothing",    amount: 89.00,  order_date: "2024-01-15" },
  { order_id: 104, customer_id: 3, product_category: "Electronics", amount: 549.99, order_date: "2024-02-01" },
  { order_id: 105, customer_id: 4, product_category: "Books",       amount: 22.99,  order_date: "2024-02-05" },
  { order_id: 106, customer_id: 5, product_category: "Clothing",    amount: 134.50, order_date: "2024-02-10" },
  { order_id: 107, customer_id: 2, product_category: "Electronics", amount: 199.99, order_date: "2024-02-15" },
  { order_id: 108, customer_id: 7, product_category: "Books",       amount: 67.00,  order_date: "2024-03-01" },
  { order_id: 109, customer_id: 1, product_category: "Clothing",    amount: 45.00,  order_date: "2024-03-05" },
  { order_id: 110, customer_id: 5, product_category: "Electronics", amount: 899.99, order_date: "2024-03-10" },
];

const JOIN_ROWS = ORDER_ROWS.map((o) => {
  const c = CUSTOMER_ROWS.find((c) => c.customer_id === o.customer_id)!;
  return {
    customer_id: c.customer_id,
    name: c.name,
    region: c.region,
    join_date: c.join_date,
    status: c.status,
    order_id: o.order_id,
    product_category: o.product_category,
    amount: o.amount,
    order_date: o.order_date,
  };
});

const FILTERED_ROWS = JOIN_ROWS.filter((r) => r.status === "active");

const GROUPED_ROWS = (() => {
  const totals = new Map<string, number>();
  for (const r of FILTERED_ROWS) {
    totals.set(r.region, (totals.get(r.region) ?? 0) + r.amount);
  }
  return Array.from(totals, ([region, total_revenue]) => ({
    region,
    // Round to 2dp so the table reads cleanly instead of "1468.4800000000002".
    total_revenue: Math.round(total_revenue * 100) / 100,
  }));
})();

/**
 * Per-table source data, keyed by **table name** (not stage id). When Qwen
 * generates a fresh pipeline its LOAD stage ids may differ — we look these
 * up by the LOAD operation's `tableName` so the source-table tabs still
 * show real rows.
 */
export const SOURCE_TABLE_RESULTS: Record<string, StageResult> = {
  customers: {
    columns: [
      { name: "customer_id", type: "integer" },
      { name: "name", type: "string" },
      { name: "region", type: "string" },
      { name: "join_date", type: "date" },
      { name: "status", type: "string" },
    ],
    rows: CUSTOMER_ROWS,
  },
  orders: {
    columns: [
      { name: "order_id", type: "integer" },
      { name: "customer_id", type: "integer" },
      { name: "product_category", type: "string" },
      { name: "amount", type: "float" },
      { name: "order_date", type: "date" },
    ],
    rows: ORDER_ROWS,
  },
};

const LOAD_CUSTOMERS_RESULT: StageResult = {
  columns: [
    { name: "customer_id", type: "integer" },
    { name: "name", type: "string" },
    { name: "region", type: "string" },
    { name: "join_date", type: "date" },
    { name: "status", type: "string" },
  ],
  rows: CUSTOMER_ROWS,
};

const LOAD_ORDERS_RESULT: StageResult = {
  columns: [
    { name: "order_id", type: "integer" },
    { name: "customer_id", type: "integer" },
    { name: "product_category", type: "string" },
    { name: "amount", type: "float" },
    { name: "order_date", type: "date" },
  ],
  rows: ORDER_ROWS,
};

/** Just the two LOAD outputs — paired with `SAMPLE_TWO_SOURCES_FLOW`. */
export const SAMPLE_TWO_SOURCES_RESULTS: Record<string, StageResult> = {
  load_customers: LOAD_CUSTOMERS_RESULT,
  load_orders: LOAD_ORDERS_RESULT,
};

export const SAMPLE_REVENUE_BY_REGION_RESULTS: Record<string, StageResult> = {
  load_customers: LOAD_CUSTOMERS_RESULT,
  load_orders: LOAD_ORDERS_RESULT,
  join_orders_customers: {
    columns: [
      { name: "customer_id", type: "integer" },
      { name: "name", type: "string" },
      { name: "region", type: "string" },
      { name: "join_date", type: "date" },
      { name: "status", type: "string" },
      { name: "order_id", type: "integer" },
      { name: "product_category", type: "string" },
      { name: "amount", type: "float" },
      { name: "order_date", type: "date" },
    ],
    rows: JOIN_ROWS,
  },
  filter_active: {
    columns: [
      { name: "customer_id", type: "integer" },
      { name: "name", type: "string" },
      { name: "region", type: "string" },
      { name: "join_date", type: "date" },
      { name: "status", type: "string" },
      { name: "order_id", type: "integer" },
      { name: "product_category", type: "string" },
      { name: "amount", type: "float" },
      { name: "order_date", type: "date" },
    ],
    rows: FILTERED_ROWS,
  },
  group_by_region: {
    columns: [
      { name: "region", type: "string" },
      { name: "total_revenue", type: "float" },
    ],
    rows: GROUPED_ROWS,
  },
};
