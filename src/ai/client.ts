export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class AiNotConfiguredError extends Error {}

/**
 * Stream a companion reply from the local proxy (POST /api/mri-chat). The
 * request is same-origin (localhost) — the browser makes NO external call; the
 * proxy talks to the gateway server-side with the de-identified context only.
 */
export async function streamChat(
  context: string,
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/mri-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context, messages }),
    signal,
  });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail || body.error || detail;
    } catch {
      /* non-JSON error */
    }
    if (res.status === 503) throw new AiNotConfiguredError(detail);
    throw new Error(detail);
  }
  if (!res.body) throw new Error('empty response');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
}
