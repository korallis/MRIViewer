import type { AssembledVolume } from '../dicom/types';
import type { Orientation } from '../state/store';

export interface SliceDrawOptions {
  window: [number, number];
  invert?: boolean;
  crosshair?: [number, number] | null; // fractional [u,v] 0..1, or null
  size?: number;
}

/**
 * CPU-sample one orthogonal plane of the normalized volume and draw it to a 2D
 * canvas (used for the live thumbnails and study-card previews — matches the
 * prototype's approach; cheap at thumbnail resolution).
 */
export function drawVolumeSlice(
  canvas: HTMLCanvasElement,
  volume: AssembledVolume,
  orientation: Orientation,
  sliceFrac: number,
  opts: SliceDrawOptions,
): void {
  const [nx, ny, nz] = volume.dims;
  const size = opts.size ?? 128;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const data = volume.data;
  const [lo, hi] = opts.window;
  const span = Math.max(hi - lo, 1e-4);

  // Plane axes: (uDim, vDim) span the image; sDim is fixed at the slice.
  let uDim: number, vDim: number, sDim: number;
  if (orientation === 'axial') { uDim = nx; vDim = ny; sDim = nz; }
  else if (orientation === 'sagittal') { uDim = ny; vDim = nz; sDim = nx; }
  else { uDim = nx; vDim = nz; sDim = ny; } // coronal

  const s = Math.min(sDim - 1, Math.max(0, Math.round(sliceFrac * (sDim - 1))));

  const at = (i: number, j: number, k: number) => data[k * nx * ny + j * nx + i]!;

  for (let py = 0; py < size; py++) {
    // Flip vertical so superior/anterior is up.
    const v = Math.round((1 - py / (size - 1)) * (vDim - 1));
    for (let px = 0; px < size; px++) {
      const u = Math.round((px / (size - 1)) * (uDim - 1));
      let raw: number;
      if (orientation === 'axial') raw = at(u, v, s);
      else if (orientation === 'sagittal') raw = at(s, u, v);
      else raw = at(u, s, v); // coronal
      let w = (raw - lo) / span;
      w = w < 0 ? 0 : w > 1 ? 1 : w;
      if (opts.invert) w = 1 - w;
      const g = Math.round(w * 255);
      const o = (py * size + px) * 4;
      img.data[o] = g;
      img.data[o + 1] = Math.min(255, g + 10);
      img.data[o + 2] = Math.min(255, g + 26);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  if (opts.crosshair) {
    const cx = opts.crosshair[0] * size;
    const cy = (1 - opts.crosshair[1]) * size;
    ctx.save();
    ctx.strokeStyle = 'rgba(99, 243, 172, 0.75)';
    ctx.lineWidth = Math.max(1, size / 130);
    ctx.setLineDash([size * 0.035, size * 0.028]);
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(size, cy); ctx.stroke();
    ctx.restore();
  }
}

/** Which texture axis (0=x,1=y,2=z) is the slice axis for an orientation. */
export function sliceAxisFor(orientation: Orientation): 0 | 1 | 2 {
  return orientation === 'axial' ? 2 : orientation === 'sagittal' ? 0 : 1;
}
