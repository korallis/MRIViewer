import { DropZone } from './DropZone';
import { SeriesBrowser } from './SeriesBrowser';
import { ErrorToasts, LiveRegion, ProgressOverlay } from './Overlays';
import { ViewerShell } from './ViewerShell';
import { useViewer } from '../state/store';

function webgl2Available(): boolean {
  try {
    return document.createElement('canvas').getContext('webgl2') != null;
  } catch {
    return false;
  }
}

const hasWebGL2 = webgl2Available();

export function App() {
  const stage = useViewer((s) => s.stage);

  if (!hasWebGL2) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 24 }}>
        <div style={{ maxWidth: 440, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20 }}>WebGL2 is not available</h1>
          <p style={{ color: 'var(--text-dim)' }}>
            MRIViewer renders volumes on the GPU and requires WebGL2. Please use a current desktop
            Chrome, Edge, or Firefox with hardware acceleration enabled.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {(stage === 'idle' || stage === 'ingesting') && <DropZone />}
      {(stage === 'browsing' || stage === 'loading') && <SeriesBrowser />}
      {stage === 'viewing' && <ViewerShell />}
      <ProgressOverlay />
      <ErrorToasts />
      <LiveRegion />
    </>
  );
}
