import { Toolbar } from './viewer/Toolbar';
import { QuadViewport } from './viewer/QuadViewport';
import { Hotkeys } from './viewer/Hotkeys';
import { ClipControls, MetadataPanel } from './viewer/SidePanels';

// Pixel readback (e2e orientation probes) also forces continuous rendering.
const NEEDS_READBACK =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('e2e');

export function ViewerShell() {
  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar />
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}>
        <QuadViewport needsReadback={NEEDS_READBACK} />
        <ClipControls />
        <MetadataPanel />
      </div>
      <Hotkeys />
    </div>
  );
}
