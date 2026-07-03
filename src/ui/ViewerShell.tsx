import { Toolbar } from './viewer/Toolbar';
import { QuadViewport } from './viewer/QuadViewport';

// Pixel readback (e2e orientation probes; Phase 6 PNG export) requires the
// drawing buffer to survive compositing, plus continuous rendering for probes.
const NEEDS_READBACK =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('e2e');

export function ViewerShell() {
  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar />
      <QuadViewport needsReadback={NEEDS_READBACK} />
    </div>
  );
}
