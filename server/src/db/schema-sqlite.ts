import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * SQLite mirror of `schema.ts`. Same logical column names and shape, but
 * dialect-appropriate types:
 *   - serial          → integer + autoIncrement
 *   - jsonb           → text mode:"json"
 *   - timestamp(tz)   → integer mode:"timestamp"
 *
 * Routes import `db` + `schema` from `./db/index.js` — whichever dialect is
 * active they call the same `.insert(table).values(...).returning(...)` API.
 */

export const pipelines = sqliteTable("pipelines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  promptText: text("prompt_text").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const pipelineNodes = sqliteTable("pipeline_nodes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pipelineId: integer("pipeline_id")
    .notNull()
    .references(() => pipelines.id, { onDelete: "cascade" }),
  nodeKey: text("node_key").notNull(),
  data: text("data", { mode: "json" }).notNull(),
});

export type Pipeline = typeof pipelines.$inferSelect;
export type NewPipeline = typeof pipelines.$inferInsert;
export type PipelineNode = typeof pipelineNodes.$inferSelect;
export type NewPipelineNode = typeof pipelineNodes.$inferInsert;
