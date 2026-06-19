import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import {
  fromAISchema,
  toAISchema,
  type AIPipelineSchema,
  type PipelineSchema,
  type StageResult,
} from "@flow";

import { TopNav } from "@/components/TopNav";
import { FlowCanvas } from "@/components/FlowCanvas";
import { ResultsPanel } from "@/components/ResultsPanel";
import { WorkspaceLayout } from "@/components/WorkspaceLayout";
import {
  ChatPanel,
  type ChatChip,
  type ChatEntry,
} from "@/components/ChatPanel";
import { useSettings, type SampleFlowOption } from "@/hooks/useSettings";
import {
  coerceAIPipelineSchema,
  generateFlow,
  streamAutopilot,
  strictValidateAIPipelineSchema,
  type AutopilotEvent,
  type ChartSpec,
  type ChatTurn,
  type PipelineAlternative,
  type SuggestionChip,
} from "@/lib/api";
import { layoutAIPipelineSchema } from "@/lib/pipelineLayout";
import {
  SAMPLE_REVENUE_BY_REGION_FLOW,
  SAMPLE_REVENUE_BY_REGION_REPORT,
  SAMPLE_REVENUE_BY_REGION_RESULTS,
  SAMPLE_TWO_SOURCES_FLOW,
  SAMPLE_TWO_SOURCES_RESULTS,
} from "@/samples";
import { ensureEngineReady, type RegisteredTable } from "@/lib/queryEngine";
import { AlternativesPicker } from "@/components/AlternativesPicker";

interface Report {
  markdown: string;
  chart?: ChartSpec;
}

interface SamplePayload {
  schema: PipelineSchema;
  results: Record<string, StageResult>;
  activeStageId: string;
  report?: Report;
}

const SAMPLES: Record<SampleFlowOption, SamplePayload> = {
  "two-sources": {
    schema: SAMPLE_TWO_SOURCES_FLOW,
    results: SAMPLE_TWO_SOURCES_RESULTS,
    activeStageId: "load_customers",
  },
  "revenue-by-region": {
    schema: SAMPLE_REVENUE_BY_REGION_FLOW,
    results: SAMPLE_REVENUE_BY_REGION_RESULTS,
    activeStageId: "group_by_region",
    report: SAMPLE_REVENUE_BY_REGION_REPORT,
  },
};

// Module-scoped counter so chat entry ids are deterministic across renders.
let nextEntryId = 1;
const makeEntry = (
  kind: ChatEntry["kind"],
  text: string,
  icon?: string,
): ChatEntry => ({ id: `e${nextEntryId++}`, kind, text, icon });

/**
 * Project chat entries into the user/assistant turns Qwen expects. Traces and
 * error bubbles are dropped — they're internal UI noise the model shouldn't
 * see. Capped at the last MAX_PAIRS pairs so context doesn't grow without
 * bound across long conversations.
 */
const MAX_HISTORY_PAIRS = 4;
function buildHistory(entries: ChatEntry[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const e of entries) {
    if (e.kind === "user") turns.push({ role: "user", content: e.text });
    else if (e.kind === "assistant")
      turns.push({ role: "assistant", content: e.text });
  }
  return turns.slice(-MAX_HISTORY_PAIRS * 2);
}

/**
 * Snapshot the current canvas as an AIPipelineSchema (datasets + stages, no
 * layout) so the agent can extend it. Returns `undefined` when the canvas is
 * empty — first turn of a conversation has nothing to extend.
 */
function snapshotPipeline(
  schema: PipelineSchema | null,
): AIPipelineSchema | undefined {
  if (!schema || schema.stages.length === 0) return undefined;
  return toAISchema(schema);
}

export default function Workspace() {
  const { settings, update } = useSettings();

  const [schema, setSchema] = useState<PipelineSchema | null>(
    () => SAMPLES[settings.sampleFlow].schema,
  );
  const [results, setResults] = useState<Record<string, StageResult>>(
    () => SAMPLES[settings.sampleFlow].results,
  );
  const [activeStageId, setActiveStageId] = useState<string | null>(
    () => SAMPLES[settings.sampleFlow].activeStageId,
  );
  const [report, setReport] = useState<Report | null>(
    () => SAMPLES[settings.sampleFlow].report ?? null,
  );
  // Drawer stays closed by default — the toggle in ResultsPanel reveals it.
  // Autopilot's `report` event flips it on explicitly (see handleAutopilotSubmit).
  const [showReport, setShowReport] = useState(false);

  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [followups, setFollowups] = useState<SuggestionChip[]>([]);
  const [alternatives, setAlternatives] = useState<PipelineAlternative[]>([]);
  const [selectedAltIndex, setSelectedAltIndex] = useState<number>(0);

  // Live list of tables DuckDB knows about. Refreshed on mount + after every
  // upload/remove. Sent to the agent so its schema awareness matches reality.
  const [tables, setTables] = useState<RegisteredTable[]>([]);
  const refreshTables = useCallback(async () => {
    try {
      const engine = await ensureEngineReady();
      setTables(await engine.listTables());
    } catch {
      /* engine not up yet — fine */
    }
  }, []);
  useEffect(() => {
    refreshTables();
  }, [refreshTables]);

  const uploadCsv = useCallback(
    async (tableName: string, csvText: string) => {
      const engine = await ensureEngineReady();
      await engine.registerCsv(tableName, csvText);
      await refreshTables();
    },
    [refreshTables],
  );

  const removeTable = useCallback(
    async (tableName: string) => {
      const engine = await ensureEngineReady();
      await engine.unregisterTable(tableName);
      await refreshTables();
    },
    [refreshTables],
  );

  // React to sample-flow switches in real time. Skipping the first run because
  // the useState initializers already produced the right state at mount.
  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    const next = SAMPLES[settings.sampleFlow];
    setSchema(next.schema);
    setResults(next.results);
    setActiveStageId(next.activeStageId);
    setReport(next.report ?? null);
  }, [settings.sampleFlow]);

  const showFullPipeline = useCallback(() => {
    const next = SAMPLES["revenue-by-region"];
    setSchema(next.schema);
    setResults(next.results);
    setActiveStageId(next.activeStageId);
    setReport(next.report ?? null);
    if (settings.sampleFlow !== "revenue-by-region")
      update("sampleFlow", "revenue-by-region");
    setEntries((prev) => [
      ...prev,
      makeEntry("user", "Show me the full sample pipeline: revenue by region."),
      makeEntry(
        "assistant",
        "Loaded the full pipeline: 2 LOADs → JOIN → FILTER → GROUP. A sample report + chart are available under \"Show report\".",
      ),
    ]);
  }, [settings.sampleFlow, update]);

  const selectAlternative = useCallback(
    async (index: number) => {
      const alt = alternatives[index];
      if (!alt) return;
      setSelectedAltIndex(index);
      const validation = strictValidateAIPipelineSchema(alt.pipeline);
      if (validation) {
        setEntries((prev) => [
          ...prev,
          makeEntry(
            "error",
            `Alternative ${index + 1} is invalid: ${validation}`,
          ),
        ]);
        return;
      }
      const next = layoutAIPipelineSchema(
        fromAISchema(coerceAIPipelineSchema(alt.pipeline)),
      );
      setSchema(next);
      setActiveStageId(next.stages[0]?.id ?? null);
      try {
        const engine = await ensureEngineReady();
        setResults(await engine.executePipeline(next));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setEntries((prev) => [
          ...prev,
          makeEntry("error", `DuckDB execution failed: ${msg}`),
        ]);
        setResults({});
      }
    },
    [alternatives],
  );

  const handleNewChat = useCallback(() => {
    setEntries([]);
    setShowReport(false);
    setFollowups([]);
    setAlternatives([]);
    setSelectedAltIndex(0);
    const next = SAMPLES[settings.sampleFlow];
    setSchema(next.schema);
    setResults(next.results);
    setActiveStageId(next.activeStageId);
    setReport(next.report ?? null);
  }, [settings.sampleFlow]);

  const handleManualSubmit = useCallback(
    async (prompt: string) => {
      // Any stale sample report (or previous autopilot report) belongs to the
      // pipeline it was generated for, not this fresh one.
      setReport(null);
      setFollowups([]);
      setAlternatives([]);
      setSelectedAltIndex(0);
      setEntries((prev) => [
        ...prev,
        makeEntry("trace", "Thinking through the request…", "🧠"),
      ]);
      try {
        const {
          ai,
          followups: manualFollowups,
          report: manualReport,
        } = await generateFlow({
          prompt,
          apiKey: settings.apiKey,
          tables,
          history: buildHistory(entries),
          currentPipeline: snapshotPipeline(schema),
        });
        setEntries((prev) => [
          ...prev,
          makeEntry(
            "trace",
            `Drafting the pipeline (${
              Array.isArray(ai?.stages) ? ai.stages.length : 0
            } stages)`,
            "✍️",
          ),
        ]);
        const validation = strictValidateAIPipelineSchema(ai);
        if (validation)
          throw new Error(
            `Qwen returned an unrenderable pipeline — ${validation}`,
          );
        // Pass current schema as `base` so existing stage layout/colors are
        // preserved for stages the model kept. New stages get auto-positioned.
        const nextSchema = layoutAIPipelineSchema(
          fromAISchema(coerceAIPipelineSchema(ai), {
            base: schema ?? undefined,
          }),
        );
        setSchema(nextSchema);
        setActiveStageId(nextSchema.stages[0]?.id ?? null);
        setEntries((prev) => [
          ...prev,
          makeEntry(
            "trace",
            `Laying out ${nextSchema.stages.length} stages on the canvas`,
            "🎨",
          ),
        ]);
        // Run the pipeline against DuckDB-WASM so each stage tab populates
        // with real rows. Failure is non-fatal — the canvas still renders.
        try {
          const engine = await ensureEngineReady();
          setEntries((prev) => [
            ...prev,
            makeEntry("trace", "Executing the pipeline in DuckDB…", "⚙️"),
          ]);
          const rows = await engine.executePipeline(nextSchema);
          setResults(rows);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setEntries((prev) => [
            ...prev,
            makeEntry("error", `DuckDB execution failed: ${msg}`),
          ]);
          setResults({});
        }
        if (manualFollowups.length > 0) setFollowups(manualFollowups);
        if (manualReport) {
          setReport(manualReport);
          setShowReport(true);
        }
        const reportNote = manualReport
          ? "Report + chart available below the tables."
          : "Each tab shows the first 200 rows from DuckDB.";
        setEntries((prev) => [
          ...prev,
          makeEntry(
            "assistant",
            `Generated and ran a pipeline with ${nextSchema.stages.length} stage${
              nextSchema.stages.length === 1 ? "" : "s"
            }. ${reportNote}`,
          ),
        ]);
      } catch (err) {
        const text = err instanceof Error ? err.message : String(err);
        setEntries((prev) => [...prev, makeEntry("error", text)]);
      }
    },
    [settings.apiKey, tables, entries, schema],
  );

  const handleAutopilotSubmit = useCallback(
    async (prompt: string) => {
      // Reset any previous report + suggestions + alternatives so the new run
      // isn't confused with the last one.
      setReport(null);
      setFollowups([]);
      setAlternatives([]);
      setSelectedAltIndex(0);
      try {
        let stageCount = 0;
        let reportArrived = false;
        await streamAutopilot({
          prompt,
          apiKey: settings.apiKey,
          tables,
          history: buildHistory(entries),
          currentPipeline: snapshotPipeline(schema),
          onEvent: (event: AutopilotEvent) => {
            switch (event.type) {
              case "trace":
                setEntries((prev) => [
                  ...prev,
                  makeEntry("trace", event.label, event.icon),
                ]);
                break;
              case "pipeline": {
                const validation = strictValidateAIPipelineSchema(event.ai);
                if (validation) {
                  setEntries((prev) => [
                    ...prev,
                    makeEntry(
                      "error",
                      `Agent emitted invalid pipeline: ${validation}`,
                    ),
                  ]);
                  return;
                }
                const next = layoutAIPipelineSchema(
                  fromAISchema(coerceAIPipelineSchema(event.ai), {
                    base: schema ?? undefined,
                  }),
                );
                stageCount = next.stages.length;
                setSchema(next);
                setActiveStageId(next.stages[0]?.id ?? null);
                // Fire-and-forget the DuckDB run — the agent keeps streaming
                // its trace + report in parallel. Result tabs fill in when
                // the engine completes.
                ensureEngineReady()
                  .then((engine) => engine.executePipeline(next))
                  .then(setResults)
                  .catch((err: unknown) => {
                    const msg =
                      err instanceof Error ? err.message : String(err);
                    setEntries((prev) => [
                      ...prev,
                      makeEntry(
                        "error",
                        `DuckDB execution failed: ${msg}`,
                      ),
                    ]);
                  });
                break;
              }
              case "report":
                reportArrived = true;
                setReport({ markdown: event.markdown, chart: event.chart });
                setShowReport(true);
                break;
              case "suggestions":
                setFollowups(event.chips);
                break;
              case "alternatives":
                setAlternatives(event.items);
                setSelectedAltIndex(0);
                break;
              case "error":
                setEntries((prev) => [
                  ...prev,
                  makeEntry("error", event.message),
                ]);
                break;
              case "done": {
                let summary: string;
                if (stageCount > 0 && reportArrived) {
                  summary = `Autopilot finished — ${stageCount} stage${
                    stageCount === 1 ? "" : "s"
                  } on the canvas, report below the results.`;
                } else if (stageCount > 0) {
                  summary = `Autopilot finished — ${stageCount} stage${
                    stageCount === 1 ? "" : "s"
                  } on the canvas, but no report was written. Try asking again with "write a report".`;
                } else {
                  summary = "Autopilot finished with no output.";
                }
                setEntries((prev) => [
                  ...prev,
                  makeEntry("assistant", summary),
                ]);
                break;
              }
            }
          },
        });
      } catch (err) {
        const text = err instanceof Error ? err.message : String(err);
        setEntries((prev) => [...prev, makeEntry("error", text)]);
      }
    },
    [settings.apiKey, tables, entries, schema],
  );

  const handleSubmit = useCallback(
    async (prompt: string) => {
      setBusy(true);
      setEntries((prev) => [...prev, makeEntry("user", prompt)]);
      try {
        if (settings.agentMode === "autopilot") {
          await handleAutopilotSubmit(prompt);
        } else {
          await handleManualSubmit(prompt);
        }
      } finally {
        setBusy(false);
      }
    },
    [settings.agentMode, handleAutopilotSubmit, handleManualSubmit],
  );

  const chips: ChatChip[] = useMemo(
    () => [
      {
        label: "Show full pipeline",
        prompt:
          "Show me the full sample pipeline: revenue by region for active customers.",
        hint: "Two LOADs → JOIN → FILTER → GROUP, with precomputed rows.",
        onClick: showFullPipeline,
      },
      {
        label: "Top customers",
        prompt:
          "Show me the top 5 customers by total order amount, including their region.",
        hint: "JOIN customers + orders, GROUP by customer, SORT, LIMIT.",
      },
      {
        label: "Monthly revenue",
        prompt:
          "Compute monthly revenue from active customers' orders, grouped by product category.",
        hint: "FILTER on status, GROUP by month and category.",
      },
    ],
    [showFullPipeline],
  );

  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <TopNav
        settings={settings}
        onSettingChange={update}
        tables={tables}
        onUploadCsv={uploadCsv}
        onRemoveTable={removeTable}
      />

      <main className="flex-1 overflow-hidden">
        <Group
          id="qwen-shell"
          orientation="horizontal"
          className="h-full w-full"
        >
          <Panel
            id="sidebar"
            defaultSize="380px"
            minSize="280px"
            maxSize="560px"
            groupResizeBehavior="preserve-pixel-size"
          >
            <ChatPanel
              entries={entries}
              chips={chips}
              followups={followups}
              busy={busy}
              onSubmit={handleSubmit}
              onNewChat={handleNewChat}
              mode={settings.agentMode}
              onModeChange={(m) => update("agentMode", m)}
              autoSendSuggestion={settings.autoSendSuggestion}
              onAutoSendSuggestionChange={(v) =>
                update("autoSendSuggestion", v)
              }
            />
          </Panel>
          <Separator className="w-1 shrink-0 cursor-col-resize bg-slate-200 transition-colors hover:bg-indigo-400 dark:bg-slate-700" />
          <Panel id="workspace" minSize="40%">
            <WorkspaceLayout
              layoutMode={settings.layoutMode}
              canvas={
                <div className="relative h-full w-full bg-slate-50 dark:bg-slate-900">
                  <FlowCanvas
                    schema={schema}
                    onShowOutput={setActiveStageId}
                  />
                  <AlternativesPicker
                    alternatives={alternatives}
                    selectedIndex={selectedAltIndex}
                    onSelect={selectAlternative}
                  />
                </div>
              }
              results={
                <ResultsPanel
                  schema={schema}
                  results={results}
                  activeStageId={activeStageId}
                  onActiveStageIdChange={setActiveStageId}
                  report={report}
                  showReport={showReport}
                  onShowReportChange={setShowReport}
                />
              }
            />
          </Panel>
        </Group>
      </main>
    </div>
  );
}
