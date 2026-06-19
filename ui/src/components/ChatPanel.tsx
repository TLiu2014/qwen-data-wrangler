import { Loader2, MessageSquare, RotateCcw, Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AgentMode } from "@/hooks/useSettings";

export type ChatEntryKind = "user" | "assistant" | "error" | "trace";

export interface ChatEntry {
  id: string;
  kind: ChatEntryKind;
  text: string;
  /** Only used when kind === "trace" — small leading glyph (e.g. 🔍 / ✅). */
  icon?: string;
}

export interface ChatChip {
  /** Short label shown in the chip header. */
  label: string;
  /** The prompt text — also shown in the chip body for transparency. */
  prompt: string;
  /** One-line hint describing what the chip does. */
  hint?: string;
  /** Custom click handler. When omitted, `prompt` is submitted via `onSubmit`. */
  onClick?: () => void;
}

export interface ChatPanelProps {
  entries: ChatEntry[];
  chips: ChatChip[];
  /** Follow-up chips the autopilot agent suggested at the end of the last turn. */
  followups: ChatChip[];
  busy: boolean;
  onSubmit: (prompt: string) => void;
  /** Clear chat history (and reset the canvas to its sample/empty default). */
  onNewChat: () => void;
  mode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
  /** When true, clicking a follow-up chip sends it immediately instead of filling the composer. */
  autoSendSuggestion: boolean;
  onAutoSendSuggestionChange: (v: boolean) => void;
}

export function ChatPanel({
  entries,
  chips,
  followups,
  busy,
  onSubmit,
  onNewChat,
  mode,
  onModeChange,
  autoSendSuggestion,
  onAutoSendSuggestionChange,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Pin to bottom on new turn (matches gemini-nosql's AgentChatPanel behavior).
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries.length, busy]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || busy) return;
    onSubmit(trimmed);
    setDraft("");
  }

  const isAutopilot = mode === "autopilot";

  return (
    <aside className="flex h-full flex-col bg-white dark:bg-slate-950">
      <ModeSegmentedControl
        mode={mode}
        disabled={busy}
        onChange={onModeChange}
      />
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-3 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        <span className="font-medium text-slate-700 dark:text-slate-200">
          Chat
        </span>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={onNewChat}
            title="Clear chat history and reset the canvas"
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 normal-case tracking-normal transition-colors hover:bg-white hover:text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RotateCcw className="h-3 w-3" />
            New chat
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {entries.length === 0 ? (
          <ChipStrip
            chips={chips}
            busy={busy}
            onActivate={(chip) => {
              if (chip.onClick) {
                chip.onClick();
                return;
              }
              if (autoSendSuggestion) {
                onSubmit(chip.prompt);
              } else {
                setDraft(chip.prompt);
                inputRef.current?.focus();
              }
            }}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map((e) =>
              e.kind === "trace" ? (
                <TraceLine key={e.id} entry={e} />
              ) : (
                <Bubble key={e.id} entry={e} />
              ),
            )}
            {busy && (
              <div className="self-start rounded-[10px] rounded-bl-[3px] bg-slate-100 px-3 py-2 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                {isAutopilot ? "Autopilot is working…" : "Qwen is thinking…"}
              </div>
            )}
            {!busy && followups.length > 0 && (
              <FollowupChips
                chips={followups}
                autoSend={autoSendSuggestion}
                onAutoSendChange={onAutoSendSuggestionChange}
                onPick={(text) => {
                  if (autoSendSuggestion) {
                    onSubmit(text);
                  } else {
                    setDraft(text);
                    inputRef.current?.focus();
                  }
                }}
              />
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <form onSubmit={handleSubmit} className="flex items-center gap-2 p-3">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              isAutopilot
                ? "Ask the autopilot for an analysis…"
                : "Describe a transformation…"
            }
            disabled={busy}
            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          <Button
            type="submit"
            size="icon"
            disabled={busy || draft.trim().length === 0}
            aria-label="Send"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </aside>
  );
}

function ModeSegmentedControl({
  mode,
  disabled,
  onChange,
}: {
  mode: AgentMode;
  disabled?: boolean;
  onChange: (m: AgentMode) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Agent mode"
      className="grid shrink-0 grid-cols-2 gap-1.5 border-b border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900"
    >
      <ModeOption
        active={mode === "manual"}
        disabled={disabled}
        onClick={() => onChange("manual")}
        icon={<MessageSquare className="h-3.5 w-3.5" />}
        label="Copilot"
        hint="One pipeline per turn"
      />
      <ModeOption
        active={mode === "autopilot"}
        disabled={disabled}
        onClick={() => onChange("autopilot")}
        icon={<Sparkles className="h-3.5 w-3.5" />}
        label="Autopilot"
        hint="Plan → analyze → report"
      />
    </div>
  );
}

function ModeOption({
  active,
  disabled,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 text-left transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-60",
        active
          ? "border-indigo-500 bg-indigo-500 text-white shadow-sm dark:border-indigo-400 dark:bg-indigo-500"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800",
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold">
        {icon}
        {label}
      </span>
      <span
        className={cn(
          "text-[10px]",
          active ? "text-indigo-100" : "text-slate-400 dark:text-slate-500",
        )}
      >
        {hint}
      </span>
    </button>
  );
}

function TraceLine({ entry }: { entry: ChatEntry }) {
  // Pill style mirrors gemini-nosql's StepLine: font-mono, slate border + tint,
  // small icon prefix, compact padding. Self-aligned left like assistant
  // bubbles so the visual hierarchy reads "trace = quieter, bubble = louder".
  return (
    <div className="self-start inline-flex max-w-[92%] items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
      <span aria-hidden className="shrink-0">
        {entry.icon ?? "·"}
      </span>
      <span className="truncate">{entry.text}</span>
    </div>
  );
}

function Bubble({ entry }: { entry: ChatEntry }) {
  const isUser = entry.kind === "user";
  const isError = entry.kind === "error";
  return (
    <div
      className={cn(
        "max-w-[92%] rounded-[10px] px-3 py-2 text-sm leading-snug",
        isUser &&
          "self-end rounded-br-[3px] bg-indigo-50 text-slate-900 dark:bg-indigo-500/15 dark:text-indigo-100",
        !isUser &&
          !isError &&
          "self-start rounded-bl-[3px] bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100",
        isError &&
          "self-start rounded-bl-[3px] border border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
      )}
    >
      <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {isUser ? "You" : isError ? "Error" : "Qwen"}
      </div>
      <div className="whitespace-pre-wrap break-words">{entry.text}</div>
    </div>
  );
}

function FollowupChips({
  chips,
  autoSend,
  onAutoSendChange,
  onPick,
}: {
  chips: ChatChip[];
  autoSend: boolean;
  onAutoSendChange: (v: boolean) => void;
  onPick: (prompt: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 self-start">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Suggested follow-ups
        </p>
        <label
          className="inline-flex cursor-pointer items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400"
          title="When checked, clicking a chip sends it immediately. When unchecked, it fills the composer for you to edit first."
        >
          <input
            type="checkbox"
            checked={autoSend}
            onChange={(e) => onAutoSendChange(e.target.checked)}
            className="h-3 w-3 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
          />
          <span>Click to send</span>
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => onPick(c.prompt)}
            title={c.prompt}
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              "border-indigo-200 bg-indigo-50 text-indigo-700",
              "hover:border-indigo-300 hover:bg-indigo-100",
              "dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200",
              "dark:hover:border-indigo-400 dark:hover:bg-indigo-500/20",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChipStrip({
  chips,
  onActivate,
  busy,
}: {
  chips: ChatChip[];
  onActivate: (chip: ChatChip) => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Try one of these
      </p>
      <div className="flex flex-col gap-2">
        {chips.map((chip) => (
          <button
            key={chip.label}
            type="button"
            disabled={busy}
            onClick={() => onActivate(chip)}
            className={cn(
              "group flex w-full flex-col gap-0.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition-colors",
              "hover:border-indigo-300 hover:bg-indigo-50",
              "disabled:cursor-not-allowed disabled:opacity-60",
              "dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-500 dark:hover:bg-indigo-500/10",
            )}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
              {chip.label}
            </span>
            <span className="text-xs text-slate-700 dark:text-slate-200">
              “{chip.prompt}”
            </span>
            {chip.hint && (
              <span className="text-[10px] italic text-slate-400 dark:text-slate-500">
                {chip.hint}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
