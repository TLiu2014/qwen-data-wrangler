import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const pipelines = pgTable("pipelines", {
  id: serial("id").primaryKey(),
  promptText: text("prompt_text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * One row per node in a generated pipeline. `data` holds the full UI-side
 * stage payload (StageNodeData + layout position) as JSONB so the UI can
 * rehydrate without an extra join.
 */
export const pipelineNodes = pgTable("pipeline_nodes", {
  id: serial("id").primaryKey(),
  pipelineId: integer("pipeline_id")
    .notNull()
    .references(() => pipelines.id, { onDelete: "cascade" }),
  nodeKey: text("node_key").notNull(),
  data: jsonb("data").notNull(),
});

export type Pipeline = typeof pipelines.$inferSelect;
export type NewPipeline = typeof pipelines.$inferInsert;
export type PipelineNode = typeof pipelineNodes.$inferSelect;
export type NewPipelineNode = typeof pipelineNodes.$inferInsert;
