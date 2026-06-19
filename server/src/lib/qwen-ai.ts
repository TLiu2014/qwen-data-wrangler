import { createOpenAI } from "@ai-sdk/openai";

const BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

/**
 * Vercel AI SDK provider pointed at Qwen's OpenAI-compatible DashScope endpoint.
 * Use `qwenWithKey(headerKey)(QWEN_MODEL)` so each request can override the
 * server's `DASHSCOPE_API_KEY` with a UI-supplied key.
 */
export function qwenWithKey(overrideKey?: string | null) {
  const apiKey = (overrideKey ?? "").trim() || process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "No DashScope API key — set DASHSCOPE_API_KEY in .env or send x-dashscope-api-key header",
    );
  }
  return createOpenAI({ apiKey, baseURL: BASE_URL });
}

// Default model when QWEN_MODEL isn't set in .env. Cheapest tier.
// Alternatives: "qwen-plus" (balanced) / "qwen-max" (strongest).
export const QWEN_MODEL = process.env.QWEN_MODEL ?? "qwen-turbo";
