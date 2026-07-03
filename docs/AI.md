# AI companion (optional, opt-in)

MRIViewer ships an **optional** evidence companion that sends a study's
**de-identified technical context** to an LLM for contextual analysis (what a
sequence is used for, what a radiologist evaluates, what to ask an expert).

It is **off by default**. A freshly-cloned repo runs fully local with zero
network calls until you both configure a key *and* toggle it on in the UI.

## Privacy model

- **Off by default** — the toggle lives in the Companion panel; the state
  persists in `localStorage`. When off, nothing changes about the local-only
  guarantee.
- **The browser never makes an external request.** The LLM call runs in a
  **server-side Vite proxy** (`/api/mri-chat`, added by `src/server/aiProxy.ts`
  in dev + preview). The browser only ever talks to `localhost`; the local Node
  process reaches the gateway.
- **De-identified only.** The client sends technical descriptors — modality,
  series/study description, dimensions, spacing, encoding, intensity range —
  and nothing else. Patient name, ID, birth date, sex, study date, institution,
  accession, and all UIDs are excluded (`src/ai/deidentify.ts`,
  `EXCLUDED_PHI_FIELDS`). No pixel data is sent.
- **Not diagnostic.** The companion has no pixel data and is instructed to give
  contextual guidance only, with a standing caveat that a radiologist's report
  governs.

## Enabling it

1. Copy `.env.example` → `.env.local` and set `AI_GATEWAY_API_KEY` (Vercel AI
   Gateway; the deployment used here has a Zero Data Retention agreement).
2. Run through the Vite server so the proxy is present:
   ```bash
   npm run dev      # or: npm run build && npm run preview
   ```
3. In the Companion panel, click **Enable AI analysis**, then **Analyze study**
   or type a question.

> The pure static `dist/` served by `npx serve` has **no** proxy, so AI is
> unavailable there by design — that build stays strictly local-only. AI needs
> the dev/preview server.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `AI_GATEWAY_API_KEY` | — | Required to enable. Gateway bearer key. |
| `AI_GATEWAY_BASE` | `https://ai-gateway.vercel.sh/v1` | OpenAI-compatible base URL. |
| `MRIVIEWER_AI_MODEL` | `anthropic/claude-opus-4.8` | Model slug. |

Model access goes through the Vercel AI SDK (`ai` + `@ai-sdk/openai-compatible`,
dev dependencies used only by the proxy — never bundled into the client).
