import { TopBar } from './shell/TopBar';
import { StudiesPanel } from './shell/StudiesPanel';
import { ViewerShell } from './shell/ViewerShell';
import { CompanionPanel } from './shell/CompanionPanel';
import { ProgressOverlay, ErrorToasts, LiveRegion } from './shell/Overlays';
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
  void stage;

  if (!hasWebGL2) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 24, textAlign: 'center' }}>
        <div style={{ maxWidth: 440 }}>
          <h1 style={{ fontSize: 20 }}>WebGL2 is not available</h1>
          <p style={{ color: 'var(--muted)' }}>
            MRIViewer renders volumes on the GPU and requires WebGL2. Please use a current desktop
            Chrome, Edge, or Firefox with hardware acceleration enabled.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar />
      <StudiesPanel />
      <ViewerShell />
      <CompanionPanel />
      <ProgressOverlay />
      <ErrorToasts />
      <LiveRegion />
    </div>
  );
}
