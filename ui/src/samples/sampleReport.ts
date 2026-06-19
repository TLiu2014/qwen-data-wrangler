import type { ChartSpec } from "@/lib/api";

export interface SampleReport {
  markdown: string;
  chart?: ChartSpec;
}

/**
 * Pre-baked report + visualization that mirrors what the autopilot agent
 * would emit for `SAMPLE_REVENUE_BY_REGION_FLOW`. Shape-compatible with the
 * stream's `write_report` payload (`{markdown, chart}`) so it loads through
 * the same code path — `setReport({...})` in Workspace, then `<ReportView>`.
 *
 * The numbers are derived from the precomputed group_by_region rows in
 * `sampleResults.ts` (same totals: North 1468.48, South 245.49, East 67.00,
 * West 22.99).
 */
export const SAMPLE_REVENUE_BY_REGION_REPORT: SampleReport = {
  markdown: `## Revenue by region — active customers

This pipeline joins **customers** with **orders** on \`customer_id\`,
keeps only customers whose \`status = 'active'\` (drops 1 of 7), then
sums \`amount\` per region.

### What the numbers say
- **North** dominates at **$1,468.48** — driven by two high-value
  Electronics orders (Alice's $299.99 and Eve's $899.99) plus three
  smaller Clothing purchases.
- **South** is a distant second at **$245.49**, both attributed to Bob.
- **East** ($67.00) and **West** ($22.99) trail with one order each;
  Carol (East) is excluded by the status filter, leaving Grace as the
  only active East-region buyer.

If you wanted to add a SORT stage after the GROUP, the natural order is
\`total_revenue DESC\` — which is exactly the order shown below.`,
  chart: {
    type: "bar",
    title: "Total revenue by region (active customers)",
    data: [
      { name: "North", value: 1468.48 },
      { name: "South", value: 245.49 },
      { name: "East", value: 67.0 },
      { name: "West", value: 22.99 },
    ],
  },
};
