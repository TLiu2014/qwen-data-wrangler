# Why this app vs. a general AI chat?

ChatGPT and Gemini already let you paste a CSV, write Python in their code
interpreters, and get a chart back. There is real overlap. This doc lays out
honestly where Qwen Data Wrangler adds value, where chat is still better, and
what the actual positioning is.

## Where we win

### 1. Visible pipeline shape, not buried in code
Chat models show multi-step transforms as Python code or paragraphs. A junior
analyst staring at *"first join, then filter active, then group by region"* in
prose can't see what data flows where. Our React Flow canvas makes the DAG
the primary artifact — you see two sources merge, fork, narrow, aggregate.
The visual *is* the explanation.

### 2. Per-stage transparency
This is the killer one. In ChatGPT, you get the final table and maybe one
chart. If revenue looks wrong, you have to ask "wait, how many rows survived
the filter?" and trust the answer. In our app every stage is a tab — 10
orders → JOIN → 10 rows → FILTER → 9 active → GROUP → 4 regions. Debugging
multi-step transforms in chat is a nightmare; our per-tab DuckDB output makes
it trivial.

### 3. Data stays where the user chooses
The default `BrowserDuckDBEngine` runs DuckDB-WASM in the tab — uploaded CSVs
never leave the user's browser. By contrast, ChatGPT's code interpreter ships
files to OpenAI's sandbox, and Gemini's does similar.

When the app is deployed against an Aliyun execution backend
(Function Compute + OSS, Hologres, AnalyticDB-PG — see
[`query-engine.md`](./query-engine.md)) the data does land on the user's own
Aliyun tenant rather than in a third-party model vendor's sandbox. That's
still meaningfully different from chat-vendor code interpreters:
the user picks the storage region, controls IAM, and the model itself
never sees raw rows — only the schema + the agent's tool calls.

So the precise claim is: **data never leaves the user's control plane**.
For local sessions, that means the browser. For deployed sessions, it means
the user's own cloud — not the LLM provider's.

### 4. Structured artifacts
A chat thread is prose. Our output is a typed `PipelineSchema` JSON — you
can save it, version it, paste it back, regenerate the same pipeline
deterministically, or wire it into another tool. ChatGPT gives you reasoning;
we give you reusable infrastructure.

### 5. Domain constraints catch model mistakes
Our zod-validated tools reject hallucinated `AGGREGATE` / `LIMIT` stage
types. ChatGPT happily writes Python that quietly drops rows. Less freedom =
fewer silent failures in this specific domain.

### 6. Conversational editing, not regeneration
"Now sort by total" should extend the canvas, not regenerate it from
scratch. Chat models replace their last answer; we splice into a typed graph
— existing stage ids are preserved, new stages are appended, layout
positions survive.

## Where chat is still better — be honest

- **Raw reasoning.** For ambiguous or genuinely novel prompts, ChatGPT-5 /
  Gemini Pro reason better than `qwen-turbo` doing multi-tool calls. Our
  model gets the structure right; theirs gets the nuance right.
- **Anything beyond the 15 stage types.** Sentiment analysis, ML inference,
  external API calls, custom UDFs. Chat can write arbitrary Python; we
  can't.
- **Multimodal input.** "Here's a screenshot of last quarter's dashboard,
  replicate it." Gemini handles it; we can't.
- **Setup cost.** ChatGPT is in everyone's browser already. Our app needs a
  server, an API key, an env file.

## Bottom line — the positioning

We're not a "chat with your data" tool — that's commoditized. We're a
**visual data-pipeline IDE driven by chat**. The value isn't the LLM (anyone
has one). The value is:

- the canvas the LLM populates,
- the per-stage tables it's grounded in,
- the typed schema it emits,
- and the fact that the engine runs in a place the user controls (their tab,
  or their own Aliyun tenant) — *not* the LLM vendor's sandbox.

If a user only needs "look at this CSV and tell me something interesting,"
ChatGPT wins. If they need to build a pipeline they can iterate on, inspect
step-by-step, save, share, and run without handing the raw data to the model
provider — that's us.

One-liner: **a data-engineer's IDE that an analyst can drive in plain English.**
Chat is the input modality, not the product.
