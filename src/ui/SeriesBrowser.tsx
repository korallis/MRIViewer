import { loadSeries } from '../ingest/ingest';
import { useViewer } from '../state/store';

export function SeriesBrowser() {
  const candidates = useViewer((s) => s.candidates);
  const report = useViewer((s) => s.report);
  const selectedKey = useViewer((s) => s.selectedKey);

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Series</h2>
        {report && (
          <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>
            {report.dicomFiles} DICOM · {report.skippedNonDicom} skipped
            {report.unreadable.length > 0 && ` · ${report.unreadable.length} unreadable`}
          </span>
        )}
        <button style={{ marginLeft: 'auto' }} onClick={() => useViewer.getState().set({ stage: 'idle' })}>
          Open another folder
        </button>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
          gap: 12,
        }}
      >
        {candidates.map((c) => (
          <button
            key={c.key}
            data-testid="series-card"
            data-reconstructable={c.reconstructable}
            disabled={!c.reconstructable && !c.multiframe}
            onClick={() => c.reconstructable && void loadSeries(c.key)}
            aria-label={`Series ${c.description}, ${c.sliceCount} slices`}
            style={{
              textAlign: 'left',
              padding: 12,
              borderRadius: 10,
              background: 'var(--panel)',
              border:
                selectedKey === c.key
                  ? '1px solid var(--accent)'
                  : '1px solid var(--border)',
              opacity: c.reconstructable ? 1 : 0.55,
              cursor: c.reconstructable ? 'pointer' : 'not-allowed',
              display: 'flex',
              gap: 12,
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 6,
                background: '#000',
                flexShrink: 0,
                overflow: 'hidden',
              }}
            >
              {c.thumbnail && (
                <img src={c.thumbnail} alt="" width={72} height={72} style={{ display: 'block' }} />
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c.description}
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                {c.dims} · {c.sliceCount} slices
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                {c.multiframe && <Badge color="var(--warn)">enhanced MR</Badge>}
                {c.lossySource && <Badge color="var(--warn)">lossy source</Badge>}
                {c.unsupportedSyntax && <Badge color="var(--err)">unsupported encoding</Badge>}
                {c.errors
                  .filter(() => !c.unsupportedSyntax)
                  .slice(0, 1)
                  .map((e) => (
                    <Badge key={e} color="var(--err)">
                      {e}
                    </Badge>
                  ))}
                {c.warnings.slice(0, 2).map((w) => (
                  <Badge key={w} color="var(--warn)">
                    {w}
                  </Badge>
                ))}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        padding: '1px 6px',
        borderRadius: 8,
        border: `1px solid ${color}`,
        color,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: 150,
      }}
    >
      {children}
    </span>
  );
}
