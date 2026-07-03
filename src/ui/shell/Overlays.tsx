import { useViewer } from '../../state/store';

export function ProgressOverlay() {
  const stage = useViewer((s) => s.stage);
  const progress = useViewer((s) => s.progress);
  if (stage !== 'ingesting' && stage !== 'loading') return null;
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div
      style={{
        position: 'fixed', inset: 0, display: 'grid', placeItems: 'center',
        background: 'rgba(5, 7, 12, 0.82)', backdropFilter: 'blur(6px)', zIndex: 50,
      }}
    >
      <div style={{ width: 340, textAlign: 'center' }}>
        <p style={{ marginBottom: 10 }}>{progress.label}</p>
        <div
          role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={progress.label}
          style={{ height: 6, borderRadius: 3, background: 'rgba(148,163,184,0.2)', overflow: 'hidden' }}
        >
          <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent), var(--accent-2))', transition: 'width 120ms' }} />
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8 }}>{progress.done} / {progress.total}</p>
      </div>
    </div>
  );
}

export function ErrorToasts() {
  const errors = useViewer((s) => s.errors);
  if (errors.length === 0) return null;
  return (
    <div className="err-toasts">
      {errors.slice(-3).map((e, i) => (
        <div key={`${i}-${e}`} role="alert" className="err-toast">
          {e}
          <button
            aria-label="Dismiss"
            style={{ marginLeft: 10, padding: '0 6px', borderRadius: 8 }}
            onClick={() => useViewer.getState().set({ errors: errors.filter((x) => x !== e) })}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function LiveRegion() {
  const announce = useViewer((s) => s.announce);
  return (
    <div aria-live="polite" className="visually-hidden">{announce}</div>
  );
}
