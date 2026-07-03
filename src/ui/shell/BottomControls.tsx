import { useEffect, useRef } from 'react';
import { useViewer } from '../../state/store';
import { getVolume } from '../../state/resources';
import { drawVolumeSlice, sliceAxisFor } from '../../volume/sample';
import { COLORMAPS } from '../../render/luts';

export function BottomControls() {
  const orientation = useViewer((s) => s.orientation);
  const opacity = useViewer((s) => s.opacity);
  const contrast = useViewer((s) => s.contrast);
  const colormap = useViewer((s) => s.colormap);
  const renderMode = useViewer((s) => s.renderMode);
  const crosshairTex = useViewer((s) => s.crosshairTex);
  const set = useViewer((s) => s.set);
  const camera = useViewer((s) => s.camera);

  const entry = getVolume();
  const dims = entry?.volume.dims ?? [1, 1, 1];
  const axis = sliceAxisFor(orientation);
  const dim = dims[axis];
  const sliceIdx = Math.round(crosshairTex[axis] * (dim - 1));

  // Contrast → window width around the volume's percentile center.
  const applyContrast = (value: number) => {
    const e = getVolume();
    if (!e) return set({ contrast: value });
    const [blo, bhi] = e.volume.window;
    const center = (blo + bhi) / 2;
    const baseW = Math.max(bhi - blo, 0.02);
    const w = Math.max(0.01, baseW / value);
    set({ contrast: value, windowClim: [Math.max(0, center - w / 2), Math.min(1, center + w / 2)] });
  };

  const setSlice = (idx: number) => {
    const next = [...crosshairTex] as [number, number, number];
    next[axis] = dim > 1 ? idx / (dim - 1) : 0.5;
    set({ crosshairTex: next, cine: false });
  };

  return (
    <section className="bottom-controls">
      <div className="control-box">
        <h3>Viewer controls</h3>
        <div className="control-grid">
          <label htmlFor="slice">Slice</label>
          <input id="slice" type="range" min={0} max={Math.max(0, dim - 1)} value={sliceIdx}
            onChange={(e) => setSlice(Number(e.target.value))} />
          <span className="value">{sliceIdx}</span>
        </div>
        <div className="control-grid">
          <label htmlFor="opacity">Opacity</label>
          <input id="opacity" type="range" min={15} max={100} value={Math.round(opacity * 100)}
            onChange={(e) => set({ opacity: Number(e.target.value) / 100 })} />
          <span className="value">{Math.round(opacity * 100)}%</span>
        </div>
        <div className="control-grid">
          <label htmlFor="contrast">Contrast</label>
          <input id="contrast" type="range" min={60} max={180} value={Math.round(contrast * 100)}
            onChange={(e) => applyContrast(Number(e.target.value) / 100)} />
          <span className="value">{Math.round(contrast * 100)}%</span>
        </div>
        <div className="control-grid">
          <label htmlFor="cmap">Colormap</label>
          <select id="cmap" value={colormap} onChange={(e) => set({ colormap: e.target.value })}>
            {COLORMAPS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <span />
        </div>
      </div>

      <div className="control-box">
        <h3>Interaction</h3>
        <div className="mini-actions">
          <button className={renderMode === 1 ? 'active' : ''} onClick={() => set({ renderMode: 1 })}>DVR</button>
          <button className={renderMode === 0 ? 'active' : ''} onClick={() => set({ renderMode: 0 })}>MIP</button>
          <button className={renderMode === 2 ? 'active' : ''} onClick={() => set({ renderMode: 2 })}>ISO</button>
        </div>
        <div className="mini-actions" style={{ marginTop: 8 }}>
          <button onClick={() => camera('front')}>Front</button>
          <button onClick={() => camera('side')}>Side</button>
          <button onClick={() => camera('top')}>Top</button>
          <button onClick={() => set({ invert: !useViewer.getState().invert })}>Invert</button>
        </div>
      </div>

      <div className="control-box">
        <h3>Live orthogonal slices</h3>
        <div className="thumb-grid">
          <Thumb orientation="axial" label="Axial" />
          <Thumb orientation="sagittal" label="Sagittal" />
          <Thumb orientation="coronal" label="Coronal" />
        </div>
      </div>
    </section>
  );
}

function Thumb({ orientation, label }: { orientation: 'axial' | 'sagittal' | 'coronal'; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const crosshairTex = useViewer((s) => s.crosshairTex);
  const windowClim = useViewer((s) => s.windowClim);
  const invert = useViewer((s) => s.invert);
  const volumeVersion = useViewer((s) => s.volumeVersion);
  const activeOrientation = useViewer((s) => s.orientation);
  const set = useViewer((s) => s.set);

  const axis = sliceAxisFor(orientation);
  const entry = getVolume();
  const dim = entry ? entry.volume.dims[axis] : 1;
  const idx = Math.round(crosshairTex[axis] * (dim - 1));

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !entry) return;
    // Crosshair marks the other two axes' positions on this plane.
    let cu: number, cv: number;
    if (orientation === 'axial') { cu = crosshairTex[0]; cv = crosshairTex[1]; }
    else if (orientation === 'sagittal') { cu = crosshairTex[1]; cv = crosshairTex[2]; }
    else { cu = crosshairTex[0]; cv = crosshairTex[2]; }
    drawVolumeSlice(canvas, entry.volume, orientation, crosshairTex[axis], {
      window: windowClim,
      invert,
      crosshair: [cu, cv],
      size: 128,
    });
  }, [crosshairTex, windowClim, invert, volumeVersion, orientation, axis, entry]);

  return (
    <div className="thumb" style={{ outline: activeOrientation === orientation ? '1px solid var(--accent)' : 'none' }}>
      <canvas ref={ref} onClick={() => set({ orientation })} style={{ cursor: 'pointer' }} />
      <div className="thumb-label"><strong>{label}</strong><span>{idx}</span></div>
    </div>
  );
}
