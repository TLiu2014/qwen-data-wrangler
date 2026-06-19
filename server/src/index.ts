import "dotenv/config";
import cors from "cors";
import express from "express";
import { autopilotRouter } from "./routes/autopilot.js";
import { generateFlowRouter } from "./routes/generate-flow.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api", generateFlowRouter);
app.use("/api", autopilotRouter);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[qwen-data-wrangler] server listening on :${port}`);
});
