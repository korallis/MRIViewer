import { useRef, useState } from 'react';
import { useViewer } from '../../state/store';
import { getVolume } from '../../state/resources';
import { buildStudyContext, contextToText, EXCLUDED_PHI_FIELDS } from '../../ai/deidentify';
import { AiNotConfiguredError, streamChat, type ChatMessage } from '../../ai/client';

export function AiCompanion() {
  const aiEnabled = useViewer((s) => s.aiEnabled);
  const set = useViewer((s) => s.set);
  const showToast = useViewer((s) => s.showToast);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const toggle = (on: boolean) => {
    set({ aiEnabled: on });
    if (typeof localStorage !== 'undefined') localStorage.setItem('mriviewer.aiEnabled', on ? '1' : '0');
    showToast(on ? 'AI companion enabled' : 'AI companion disabled — fully local');
    if (!on) {
      abortRef.current?.abort();
      setMessages([]);
      setError(null);
    }
  };

  async function send(userText: string) {
    const entry = getVolume();
    if (!entry) return;
    setError(null);
    const context = contextToText(buildStudyContext(entry.volume));
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: userText }];
    setMessages([...nextMessages, { role: 'assistant', content: '' }]);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamChat(context, nextMessages, (chunk) => {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: copy[copy.length - 1]!.content + chunk };
          return copy;
        });
      }, ctrl.signal);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const msg =
        err instanceof AiNotConfiguredError
          ? 'AI is not configured. Set AI_GATEWAY_API_KEY and run via the dev/preview server.'
          : err instanceof Error
            ? err.message
            : String(err);
      setError(msg);
      setMessages((prev) => prev.slice(0, -1)); // drop the empty assistant bubble
    } finally {
      setBusy(false);
    }
  }

  if (!aiEnabled) {
    return (
      <div className="finding" style={{ marginTop: 12 }}>
        <h3>AI analysis <span className="confidence next">off</span></h3>
        <p>
          The viewer is running fully local — no data leaves this machine. Enable the evidence
          companion to send <b>de-identified</b> technical study context (no patient identifiers, no
          pixel data) to the LegalOS AI lane for contextual analysis.
        </p>
        <button className="primary" style={{ marginTop: 10 }} onClick={() => toggle(true)}>
          Enable AI analysis
        </button>
      </div>
    );
  }

  const hasVolume = !!getVolume();
  return (
    <div className="finding" style={{ marginTop: 12 }}>
      <h3>
        AI analysis <span className="confidence">enabled</span>
      </h3>
      <p style={{ fontSize: 11, marginBottom: 8 }}>
        Sends de-identified context only ({EXCLUDED_PHI_FIELDS.length} PHI fields excluded). The
        browser talks only to localhost; the local proxy calls the gateway.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <button
          disabled={!hasVolume || busy}
          onClick={() => send('Give a concise technical overview of this MRI study for a legal reviewer: what the sequence/geometry indicate, what a radiologist evaluates on such a series, and what to ask an expert.')}
        >
          {busy ? 'Analyzing…' : 'Analyze study'}
        </button>
        <button onClick={() => toggle(false)}>Disable AI</button>
      </div>

      {messages.length > 0 && (
        <div
          style={{
            maxHeight: 260, overflowY: 'auto', display: 'grid', gap: 8, marginBottom: 8,
            borderTop: '1px solid var(--line)', paddingTop: 8,
          }}
        >
          {messages.map((m, i) => (
            <div key={i} style={{ fontSize: 12, lineHeight: 1.5 }}>
              <div style={{ color: m.role === 'user' ? 'var(--accent)' : 'var(--good)', fontWeight: 600, fontSize: 11, marginBottom: 2 }}>
                {m.role === 'user' ? 'You' : 'Companion'}
              </div>
              <div style={{ color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                {m.content || (busy && i === messages.length - 1 ? '…' : '')}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <div className="note" style={{ marginTop: 0 }}>{error}</div>}

      <form
        style={{ display: 'flex', gap: 6, marginTop: 6 }}
        onSubmit={(e) => {
          e.preventDefault();
          const t = input.trim();
          if (!t || busy || !hasVolume) return;
          setInput('');
          void send(t);
        }}
      >
        <input
          aria-label="Ask the companion"
          placeholder={hasVolume ? 'Ask about this study…' : 'Load a study first'}
          value={input}
          disabled={!hasVolume || busy}
          onChange={(e) => setInput(e.target.value)}
          style={{ flex: 1, background: 'rgba(15,23,42,0.7)', color: 'inherit', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px', fontSize: 12 }}
        />
        <button disabled={!hasVolume || busy || !input.trim()}>Send</button>
      </form>
    </div>
  );
}
