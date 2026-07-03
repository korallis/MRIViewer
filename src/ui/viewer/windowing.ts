import { useViewer } from '../../state/store';
import { getVolume } from '../../state/resources';

/**
 * Window/level drag (radiology convention, verified against Cornerstone3D):
 * horizontal drag = window WIDTH (contrast), vertical drag = window CENTER
 * (brightness). Operates in the normalized [0,1] intensity domain.
 */
export function applyWindowLevelDrag(dx: number, dy: number): void {
  const s = useViewer.getState();
  const [lo, hi] = s.windowClim;
  let center = (lo + hi) / 2;
  let width = Math.max(hi - lo, 0.002);
  width = Math.max(0.004, Math.min(1, width * (1 + dx * 0.004)));
  center = Math.max(0, Math.min(1, center + dy * 0.0025));
  const nlo = Math.max(0, center - width / 2);
  const nhi = Math.min(1, center + width / 2);
  if (nhi > nlo) s.set({ windowClim: [nlo, nhi] });
}

/**
 * Percentile W/L presets 1–9 for MR (no fixed CT-style numbers). Preset 1 is
 * the widest (full robust range); higher numbers progressively boost contrast
 * around the volume's percentile center.
 */
export function applyWindowPreset(n: number): void {
  const entry = getVolume();
  if (!entry) return;
  const [blo, bhi] = entry.volume.window;
  const center = (blo + bhi) / 2;
  const baseWidth = Math.max(bhi - blo, 0.02);
  const width = Math.max(0.01, (baseWidth * (10 - n)) / 5);
  const lo = Math.max(0, center - width / 2);
  const hi = Math.min(1, center + width / 2);
  useViewer.getState().set({ windowClim: [lo, hi] });
}
