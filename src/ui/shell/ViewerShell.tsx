import { SceneViewer } from '../viewer/SceneViewer';
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

  return (
    <main className="viewer-shell">
      <div className="viewer-header">
        <div className="viewer-title">
          <strong>{hasVolume ? entry!.volume.meta.seriesDescription || '3D Volume' : '3D MRI Viewer'}</strong>
          <span>
            {hasVolume
              ? `${cap(orientation)} · slice ${sliceIdx}/${dim - 1} · drag to orbit, wheel to zoom`
              : 'Load a study from the Studies panel'}
          </span>
        </div>
        <div className="viewer-tools">
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
          <button disabled={!hasVolume} onClick={() => { camera('reset'); showToast('View reset'); }}>
            Reset View
          </button>
        </div>
      </div>

      <div className="viewer-body">
        <div className="viewer-canvas-wrap" id="viewer-canvas-wrap">
          {hasVolume ? (
            <>
              <SceneViewer needsReadback={NEEDS_READBACK} />
              <div className="viewer-hint">DRAG orbit · WHEEL zoom · orientation + presets below</div>
              <div className="axis-gizmo" aria-hidden>
                <span className="gx">R</span>
                <span className="gy">A</span>
                <span className="gz">S</span>
              </div>
              <Toast />
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
