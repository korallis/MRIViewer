import { useViewer } from '../state/store';

export function ProgressOverlay() {
  const stage = useViewer((s) => s.stage);
  const progress = useViewer((s) => s.progress);
  if (stage !== 'ingesting' && stage !== 'loading') return null;
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(11,14,20,0.85)',
        zIndex: 50,
      }}
    >
      <div style={{ width: 320, textAlign: 'center' }}>
        <p style={{ marginBottom: 8 }}>{progress.label}</p>
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={progress.label}
          style={{
            height: 6,
            borderRadius: 3,
            background: 'var(--panel-2)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: 'var(--accent)',
              transition: 'width 120ms',
            }}
          />
        </div>
        <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 6 }}>
          {progress.done} / {progress.total}
        </p>
      </div>
    </div>
  );
}

export function ErrorToasts() {
  const errors = useViewer((s) => s.errors);
  if (errors.length === 0) return null;
  return (
    <div style={{ position: 'fixed', bottom: 12, right: 12, zIndex: 60, display: 'grid', gap: 6 }}>
      {errors.slice(-3).map((e, i) => (
        <div
          key={`${i}-${e}`}
          role="alert"
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--err)',
            borderRadius: 8,
            padding: '8px 12px',
            maxWidth: 380,
            fontSize: 13,
          }}
        >
          {e}
          <button
            aria-label="Dismiss"
            style={{ marginLeft: 10, padding: '0 6px' }}
            onClick={() =>
              useViewer.getState().set({ errors: errors.filter((x) => x !== e) })
            }
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/** Screen-reader announcements for load progress and errors (PLAN §8 a11y). */
export function LiveRegion() {
  const announce = useViewer((s) => s.announce);
  return (
    <div aria-live="polite" className="visually-hidden">
      {announce}
    </div>
  );
}
