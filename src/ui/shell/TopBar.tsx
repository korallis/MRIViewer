import { useViewer } from '../../state/store';
import { getVolume } from '../../state/resources';

export function TopBar() {
  const stage = useViewer((s) => s.stage);
  const set = useViewer((s) => s.set);
  const localOnly = true; // no LLM wired yet → fully local
  return (
    <header className="topbar">
      <div className="brand">
        <div className="logo" aria-hidden />
        <div>
          <h1>MRIViewer — Evidence Viewer</h1>
          <p>Local DICOM · interactive 3D volume · orbit · slice · orientation</p>
        </div>
      </div>
      <div className="top-actions">
        <span className="pill">
          <span className={`status-dot ${localOnly ? '' : 'warn'}`} />
          {localOnly ? 'Local only · no uploads' : 'LLM connected'}
        </span>
        {stage === 'viewing' && (
          <span className="pill" id="render-pill">
            {renderName(useViewer.getState().renderMode)}
          </span>
        )}
        <button
          disabled={!getVolume()}
          onClick={() => set({ captureNonce: useViewer.getState().captureNonce + 1 })}
        >
          Export Snapshot
        </button>
      </div>
    </header>
  );
}

function renderName(mode: number): string {
  return mode === 0 ? 'MIP' : mode === 2 ? 'ISO surface' : 'Volume (DVR)';
}
