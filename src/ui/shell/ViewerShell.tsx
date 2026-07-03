import { useEffect, useRef } from 'react';
import { SceneViewer } from '../viewer/SceneViewer';
import { MainSliceViewer } from '../viewer/MainSliceViewer';
import { BottomControls } from './BottomControls';
import { Toast } from './Toast';
import { useViewer, type Orientation } from '../../state/store';
import { getVolume } from '../../state/resources';
import { sliceAxisFor } from '../../volume/sample';

const NEEDS_READBACK =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('e2e');

export function ViewerShell() {
  const stage = useViewer((s) => s.stage);
  const orientation = useViewer((s) => s.orientation);
  const cine = useViewer((s) => s.cine);
  const viewMode = useViewer((s) => s.viewMode);
  const crosshairTex = useViewer((s) => s.crosshairTex);
  const set = useViewer((s) => s.set);
  const camera = useViewer((s) => s.camera);
  const showToast = useViewer((s) => s.showToast);

  const entry = getVolume();
  const hasVolume = stage === 'viewing' && !!entry;
  const axis = sliceAxisFor(orientation);
  const dim = entry ? entry.volume.dims[axis] : 0;
  const sliceIdx = entry ? Math.round(crosshairTex[axis] * (dim - 1)) : 0;

  const setOrientation = (o: Orientation) => {
    set({ orientation: o });
    camera(o);
    showToast(`${cap(o)} orientation`);
  };

  const resetView = () => {
    if (viewMode === 'volume') {
      camera('reset');
      showToast('View reset');
      return;
    }
    set({ crosshairTex: [0.5, 0.5, 0.5], cine: false });
    showToast('Slices centered');
  };

  return (
    <main className="viewer-shell">
      <div className="viewer-header">
        <div className="viewer-title">
          <strong>{hasVolume ? entry!.volume.meta.seriesDescription || 'MRI Series' : 'MRI Slice Viewer'}</strong>
          <span>
            {hasVolume
              ? `${viewMode === 'slices' ? 'Interactive slices' : '3D volume'} · ${cap(orientation)} · slice ${sliceIdx + 1}/${dim}`
              : 'Load a study from the Studies panel'}
          </span>
        </div>
        <div className="viewer-tools">
          <button
            className={viewMode === 'slices' ? 'active' : ''}
            disabled={!hasVolume}
            onClick={() => set({ viewMode: 'slices' })}
          >
            Slices
          </button>
          <button
            className={viewMode === 'volume' ? 'active' : ''}
            disabled={!hasVolume}
            onClick={() => set({ viewMode: 'volume' })}
          >
            3D
          </button>
          {(['axial', 'sagittal', 'coronal'] as Orientation[]).map((o) => (
            <button
              key={o}
              className={orientation === o ? 'active' : ''}
              data-testid={`orient-${o}`}
              disabled={!hasVolume}
              onClick={() => setOrientation(o)}
            >
              {cap(o)}
            </button>
          ))}
          <button
            className={cine ? 'primary' : ''}
            disabled={!hasVolume}
            onClick={() => {
              set({ cine: !cine });
              showToast(!cine ? 'Cine playback started' : 'Cine paused');
            }}
          >
            {cine ? 'Pause Cine' : 'Play Cine'}
          </button>
          <button disabled={!hasVolume} onClick={resetView}>
            Reset View
          </button>
        </div>
      </div>

      <div className="viewer-body">
        <div className="viewer-canvas-wrap" id="viewer-canvas-wrap">
          {hasVolume ? (
            <>
              {viewMode === 'slices' ? (
                <MainSliceViewer />
              ) : (
                <>
                  <SceneViewer needsReadback={NEEDS_READBACK} />
                  <div className="axis-gizmo" aria-hidden>
                    <span className="gx">R</span>
                    <span className="gy">A</span>
                    <span className="gz">S</span>
                  </div>
                </>
              )}
              <Toast />
              <CineDriver enabled={hasVolume} />
            </>
          ) : (
            <div className="empty-viewer">
              <div>
                <div className="big" aria-hidden>🧠</div>
                <p style={{ maxWidth: 340, margin: '0 auto' }}>
                  No volume loaded. Drop a DICOM folder in the <b>Studies</b> panel, then pick a
                  reconstructable series to explore it here in 3D.
                </p>
              </div>
            </div>
          )}
        </div>
        <BottomControls />
      </div>
    </main>
  );
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

function CineDriver({ enabled }: { enabled: boolean }) {
  const cine = useViewer((s) => s.cine);
  const volumeVersion = useViewer((s) => s.volumeVersion);
  const frameRef = useRef(0);
  const lastRef = useRef(0);

  useEffect(() => {
    if (!enabled || !cine) return undefined;
    const tick = (now: number) => {
      if (now - lastRef.current >= 65) {
        lastRef.current = now;
        const s = useViewer.getState();
        const entry = getVolume();
        if (entry) {
          const axis = sliceAxisFor(s.orientation);
          const dim = entry.volume.dims[axis];
          const next = [...s.crosshairTex] as [number, number, number];
          next[axis] = (next[axis] + 1 / dim) % 1;
          s.set({ crosshairTex: next });
        }
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [cine, enabled, volumeVersion]);

  return null;
}
