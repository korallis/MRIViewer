import { useViewer } from '../../state/store';
import { getVolume } from '../../state/resources';

/** Patient/study metadata with an always-visible local-only notice (PLAN §8). */
export function MetadataPanel() {
  const open = useViewer((s) => s.metadataOpen);
  const volumeVersion = useViewer((s) => s.volumeVersion);
  void volumeVersion;
  if (!open) return null;
  const entry = getVolume();
  const m = entry?.volume.meta;
  const rows: Array<[string, string]> = m
    ? [
        ['Patient', m.patientName || '—'],
        ['Patient ID', m.patientID || '—'],
        ['Birth date', m.patientBirthDate || '—'],
        ['Sex', m.patientSex || '—'],
        ['Study date', m.studyDate || '—'],
        ['Study', m.studyDescription || '—'],
        ['Series', m.seriesDescription || '—'],
        ['Modality', m.modality || '—'],
        ['Dimensions', entry ? entry.volume.dims.join(' × ') : '—'],
        ['Spacing (mm)', entry ? entry.volume.spacing.map((v) => v.toFixed(2)).join(' × ') : '—'],
        ['Bits stored', `${m.bitsStored}${m.pixelRepresentation ? ' signed' : ''}`],
        ['Transfer syntax', m.transferSyntaxUID],
      ]
    : [];

  return (
    <aside
      aria-label="Study metadata"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 300,
        background: 'var(--panel)',
        borderLeft: '1px solid var(--border)',
        padding: 14,
        overflowY: 'auto',
        zIndex: 4,
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <strong>Metadata</strong>
        <button onClick={() => useViewer.getState().set({ metadataOpen: false })}>×</button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td style={{ color: 'var(--text-dim)', padding: '3px 8px 3px 0', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                {k}
              </td>
              <td style={{ padding: '3px 0', wordBreak: 'break-word' }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p
        style={{
          marginTop: 14,
          padding: 8,
          background: 'var(--panel-2)',
          borderRadius: 6,
          color: 'var(--text-dim)',
          lineHeight: 1.4,
        }}
      >
        🔒 This study is processed entirely on your machine and never uploaded. Metadata may contain
        identifying information — verify no network requests in DevTools → Network. Not a medical
        device; not for diagnostic use.
      </p>
    </aside>
  );
}

/** Axis-aligned clip box: six sliders shrinking the raymarch interval. */
export function ClipControls() {
  const open = useViewer((s) => s.clipOpen);
  const clipMin = useViewer((s) => s.clipMin);
  const clipMax = useViewer((s) => s.clipMax);
  const set = useViewer((s) => s.set);
  if (!open) return null;
  const axes: Array<{ label: string; i: 0 | 1 | 2 }> = [
    { label: 'X', i: 0 },
    { label: 'Y', i: 1 },
    { label: 'Z', i: 2 },
  ];
  return (
    <div
      aria-label="Clip box"
      style={{
        position: 'absolute',
        left: 8,
        bottom: 8,
        width: 240,
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 12,
        zIndex: 4,
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong>Clip box</strong>
        <button
          onClick={() => set({ clipMin: [0, 0, 0], clipMax: [1, 1, 1], clipOpen: false })}
          title="Reset and close"
        >
          reset ×
        </button>
      </div>
      {axes.map(({ label, i }) => (
        <div key={label} style={{ marginBottom: 8 }}>
          <div style={{ color: 'var(--text-dim)', marginBottom: 2 }}>{label}</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={clipMin[i]}
              aria-label={`Clip ${label} min`}
              style={{ flex: 1 }}
              onChange={(e) => {
                const v = Math.min(Number(e.target.value), clipMax[i] - 0.02);
                const next: [number, number, number] = [...clipMin];
                next[i] = v;
                set({ clipMin: next });
              }}
            />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={clipMax[i]}
              aria-label={`Clip ${label} max`}
              style={{ flex: 1 }}
              onChange={(e) => {
                const v = Math.max(Number(e.target.value), clipMin[i] + 0.02);
                const next: [number, number, number] = [...clipMax];
                next[i] = v;
                set({ clipMax: next });
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
