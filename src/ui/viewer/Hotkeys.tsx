import { useEffect } from 'react';
import { useViewer } from '../../state/store';
import { applyWindowPreset } from './windowing';

/** Global keyboard shortcuts (OHIF-v3-aligned; PLAN §8). */
export function Hotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const s = useViewer.getState();
      switch (e.key) {
        case 'm':
          s.set({ renderMode: 0 });
          break;
        case 'd':
          s.set({ renderMode: 1 });
          break;
        case 's':
          s.set({ renderMode: 2 });
          break;
        case 'i':
          s.set({ invert: !s.invert });
          break;
        case ' ':
          e.preventDefault();
          s.set({ viewResetNonce: s.viewResetNonce + 1 });
          break;
        case 'ArrowUp':
        case 'ArrowDown': {
          e.preventDefault();
          const k = s.crosshairTex[2] + (e.key === 'ArrowUp' ? -1 : 1) / 64;
          s.set({ crosshairTex: [s.crosshairTex[0], s.crosshairTex[1], Math.min(1, Math.max(0, k))] });
          break;
        }
        default:
          if (e.key >= '1' && e.key <= '9') applyWindowPreset(Number(e.key));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return null;
}
