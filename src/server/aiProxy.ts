import { loadEnv, type Plugin, type Connect } from 'vite';
import type { ServerResponse } from 'node:http';

interface AiEnv {
  apiKey: string;
  base: string;
  model: string;
}
// Populated from Vite's loadEnv (reads .env / .env.local) at config time, with
// a process.env fallback. Vite does NOT auto-populate process.env for plugins.
let aiEnv: AiEnv = { apiKey: '', base: 'https://ai-gateway.vercel.sh/v1', model: 'anthropic/claude-opus-4.8' };

/**
 * Optional AI companion proxy (dev + preview only).
 *
 * POST /api/mri-chat  { context: string, messages: {role,content}[] }
 *   → streams the assistant reply as text/plain chunks.
 *
 * The LLM call happens HERE, server-side, so the browser never makes an
 * external request — it only ever talks to localhost. De-identified study
 * context is supplied by the client (see src/ai/deidentify.ts); this proxy
 * adds no identifiers. Requires AI_GATEWAY_API_KEY in the environment; without
 * it the endpoint returns 503 and the app stays fully local.
 */

const SYSTEM_PROMPT = `You are the MRIViewer evidence companion for a legal (personal-injury) review workflow.
You receive ONLY de-identified, technical descriptors of an MRI study (modality, sequence/series description, volume dimensions, voxel spacing, encoding) — never patient identifiers or pixel data.
Help a legal reviewer understand the study at a technical/contextual level: what the sequence and geometry indicate, what a radiologist typically evaluates on such a series, how spacing/coverage affect what is visible, and what to ask an expert.
Be precise and concise. You are NOT making a diagnosis and must not state clinical findings about this specific patient — you have no pixel data. Add a one-line caveat that this is contextual guidance, not a diagnostic read, and that a qualified radiologist's report governs.`;

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1_000_000) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function handle(req: Connect.IncomingMessage, res: ServerResponse): Promise<void> {
  const apiKey = aiEnv.apiKey || process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || '';
  if (!apiKey) {
    return json(res, 503, {
      error: 'AI not configured',
      detail: 'Set AI_GATEWAY_API_KEY in the environment to enable the companion. The viewer works fully without it.',
    });
  }
  let payload: { context?: string; messages?: Array<{ role: string; content: string }> };
  try {
    payload = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: 'invalid JSON body' });
  }
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  if (messages.length === 0) return json(res, 400, { error: 'no messages' });

  try {
    const { streamText } = await import('ai');
    const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');
    const base = (aiEnv.base || 'https://ai-gateway.vercel.sh/v1').replace(/\/$/, '');
    const model = aiEnv.model || 'anthropic/claude-opus-4.8';
    const gateway = createOpenAICompatible({ name: 'vercel-ai-gateway', baseURL: base, apiKey });

    const system = payload.context
      ? `${SYSTEM_PROMPT}\n\nDe-identified study context:\n${payload.context}`
      : SYSTEM_PROMPT;

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');

    const result = streamText({
      model: gateway(model),
      system,
      messages: messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content),
      })) as never,
    });
    for await (const chunk of result.textStream) res.write(chunk);
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      json(res, 502, { error: 'gateway_failed', detail: err instanceof Error ? err.message : String(err) });
    } else {
      res.end();
    }
  }
}

function middleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    if (req.url?.split('?')[0] === '/api/mri-chat' && req.method === 'POST') {
      handle(req, res as ServerResponse).catch(() => {
        if (!res.headersSent) json(res as ServerResponse, 500, { error: 'internal' });
      });
      return;
    }
    next();
  };
}

/** Vite plugin: mounts /api/mri-chat in both dev and preview servers. */
export function aiProxyPlugin(): Plugin {
  return {
    name: 'mriviewer-ai-proxy',
    configResolved(config) {
      // '' prefix loads ALL vars (incl. non-VITE_) from .env / .env.local.
      const env = loadEnv(config.mode, config.root, '');
      aiEnv = {
        apiKey: env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN || '',
        base: env.AI_GATEWAY_BASE || 'https://ai-gateway.vercel.sh/v1',
        model: env.MRIVIEWER_AI_MODEL || 'anthropic/claude-opus-4.8',
      };
    },
    configureServer(server) {
      server.middlewares.use(middleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware());
    },
  };
}
