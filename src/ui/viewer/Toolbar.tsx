import { useViewer, type RenderMode } from '../../state/store';
import { getVolume } from '../../state/resources';
import { COLORMAPS } from '../../render/luts';

export function Toolbar() {
  const renderMode = useViewer((s) => s.renderMode);
  const isoThreshold = useViewer((s) => s.isoThreshold);
  const colormap = useViewer((s) => s.colormap);
  const windowClim = useViewer((s) => s.windowClim);
  const orthographic = useViewer((s) => s.orthographic);
  const invert = useViewer((s) => s.invert);
  const convention = useViewer((s) => s.convention);
  const slabHalf = useViewer((s) => s.slabHalf);
  const set = useViewer((s) => s.set);

  const modes: Array<{ mode: RenderMode; label: string; key: string }> = [
    { mode: 0, label: 'MIP', key: 'm' },
    { mode: 1, label: 'DVR', key: 'd' },
    { mode: 2, label: 'ISO', key: 's' },
  ];

  return (
    <div
      role="toolbar"
      aria-label="Viewer tools"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        background: 'var(--panel)',
        borderBottom: '1px solid var(--border)',
        flexWrap: 'wrap',
        position: 'relative',
        zIndex: 3,
      }}
    >
      <button onClick={() => set({ stage: 'browsing' })}>← Series</button>
      <span style={{ width: 1, height: 20, background: 'var(--border)' }} />
      {modes.map((m) => (
        <button
          key={m.label}
          className={renderMode === m.mode ? 'active' : ''}
          aria-pressed={renderMode === m.mode}
          title={`${m.label} (${m.key})`}
          onClick={() => set({ renderMode: m.mode })}
        >
          {m.label}
        </button>
      ))}
      {renderMode === 2 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          iso
          <input
            type="range"
            min={0.02}
            max={0.98}
            step={0.01}
            value={isoThreshold}
            aria-label="Iso-surface threshold"
            onChange={(e) => set({ isoThreshold: Number(e.target.value) })}
          />
        </label>
      )}
      <select
        value={colormap}
        aria-label="Colormap"
        onChange={(e) => set({ colormap: e.target.value })}
        style={{ background: 'var(--panel-2)', color: 'inherit', border: '1px solid var(--border)', borderRadius: 6, padding: 4 }}
      >
        {COLORMAPS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <button className={invert ? 'active' : ''} aria-pressed={invert} title="Invert (i)" onClick={() => set({ invert: !invert })}>
        invert
      </button>
      <span style={{ width: 1, height: 20, background: 'var(--border)' }} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
        W
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={windowClim[0]}
          aria-label="Window low"
          style={{ width: 70 }}
          onChange={(e) =>
            set({ windowClim: [Math.min(Number(e.target.value), windowClim[1] - 0.001), windowClim[1]] })
          }
        />
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={windowClim[1]}
          aria-label="Window high"
          style={{ width: 70 }}
          onChange={(e) =>
            set({ windowClim: [windowClim[0], Math.max(Number(e.target.value), windowClim[0] + 0.001)] })
          }
        />
      </label>
      <button
        title="Auto window from volume percentiles"
        onClick={() => {
          const entry = getVolume();
          if (entry) set({ windowClim: entry.volume.window });
        }}
      >
        auto
      </button>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
        slab
        <input
          type="range"
          min={0}
          max={0.12}
          step={0.005}
          value={slabHalf}
          aria-label="Thick slab half-width"
          style={{ width: 60 }}
          onChange={(e) => set({ slabHalf: Number(e.target.value) })}
        />
      </label>
      <span style={{ flex: 1 }} />
      <button
        className={convention === 'neurological' ? 'active' : ''}
        title="Toggle radiological / neurological axial convention"
        onClick={() => set({ convention: convention === 'radiological' ? 'neurological' : 'radiological' })}
      >
        {convention === 'radiological' ? 'radiological' : 'neurological'}
      </button>
      <button
        className={orthographic ? 'active' : ''}
        aria-pressed={orthographic}
        onClick={() => set({ orthographic: !orthographic })}
      >
        ortho
      </button>
      <button title="Reset 3D view (space)" onClick={() => set({ viewResetNonce: useViewer.getState().viewResetNonce + 1 })}>
        reset view
      </button>
    </div>
  );
}
