import OpenAI from "openai";

const BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

/**
 * Build a DashScope-OpenAI client. When `overrideKey` is a non-empty string
 * it wins over the server's `.env` — that's how the UI's per-session API key
 * input takes effect. Throws if neither is present, deferred to request time
 * so the server still boots without keys (useful for local UI work).
 */
export function makeQwen(overrideKey?: string | null): OpenAI {
  const apiKey = (overrideKey ?? "").trim() || process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "No DashScope API key — set DASHSCOPE_API_KEY in .env or send x-dashscope-api-key header",
    );
  }
  return new OpenAI({ apiKey, baseURL: BASE_URL });
}

// Default model when QWEN_MODEL isn't set in .env. Cheapest tier.
// Alternatives: "qwen-plus" (balanced) / "qwen-max" (strongest).
export const QWEN_MODEL = process.env.QWEN_MODEL ?? "qwen-turbo";
