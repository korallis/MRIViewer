import type { AssembledVolume } from '../dicom/types';
import type { Orientation } from '../state/store';

export interface SliceDrawOptions {
  window: [number, number];
  invert?: boolean;
  crosshair?: [number, number] | null; // fractional [u,v] 0..1, or null
  size?: number;
  width?: number;
  height?: number;
  fitToPhysicalAspect?: boolean;
}

export interface SlicePlane {
  uDim: number;
  vDim: number;
  sDim: number;
  uSpacing: number;
  vSpacing: number;
}

export interface SliceViewport extends SlicePlane {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function slicePlane(volume: AssembledVolume, orientation: Orientation): SlicePlane {
  const [nx, ny, nz] = volume.dims;
  const [sx, sy, sz] = volume.spacing;
  if (orientation === 'axial') return { uDim: nx, vDim: ny, sDim: nz, uSpacing: sx, vSpacing: sy };
  if (orientation === 'sagittal') return { uDim: ny, vDim: nz, sDim: nx, uSpacing: sy, vSpacing: sz };
  return { uDim: nx, vDim: nz, sDim: ny, uSpacing: sx, vSpacing: sz };
}

export function fitSliceViewport(
  volume: AssembledVolume,
  orientation: Orientation,
  width: number,
  height: number,
): SliceViewport {
  const plane = slicePlane(volume, orientation);
  const imageAspect = (plane.uDim * plane.uSpacing) / Math.max(plane.vDim * plane.vSpacing, 1e-6);
  const canvasAspect = width / Math.max(height, 1);
  let drawWidth = width;
  let drawHeight = height;
  if (canvasAspect > imageAspect) drawWidth = height * imageAspect;
  else drawHeight = width / imageAspect;
  return {
    ...plane,
    x: (width - drawWidth) / 2,
    y: (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  };
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
  const [nx, ny] = volume.dims;
  const size = opts.size ?? 128;
  const width = opts.width ?? size;
  const height = opts.height ?? size;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(width, height);
  const data = volume.data;
  const [lo, hi] = opts.window;
  const span = Math.max(hi - lo, 1e-4);

  const viewport = opts.fitToPhysicalAspect
    ? fitSliceViewport(volume, orientation, width, height)
    : { ...slicePlane(volume, orientation), x: 0, y: 0, width, height };
  const { uDim, vDim, sDim } = viewport;

  const s = Math.min(sDim - 1, Math.max(0, Math.round(sliceFrac * (sDim - 1))));

  const at = (i: number, j: number, k: number) => data[k * nx * ny + j * nx + i]!;

  for (let py = 0; py < height; py++) {
    // Flip vertical so superior/anterior is up.
    const fy = (py - viewport.y) / Math.max(viewport.height - 1, 1);
    const inY = fy >= 0 && fy <= 1;
    const v = Math.round((1 - fy) * (vDim - 1));
    for (let px = 0; px < width; px++) {
      const fx = (px - viewport.x) / Math.max(viewport.width - 1, 1);
      const o = (py * width + px) * 4;
      if (!inY || fx < 0 || fx > 1) {
        img.data[o] = 2;
        img.data[o + 1] = 5;
        img.data[o + 2] = 10;
        img.data[o + 3] = 255;
        continue;
      }
      const u = Math.round(fx * (uDim - 1));
      let raw: number;
      if (orientation === 'axial') raw = at(u, v, s);
      else if (orientation === 'sagittal') raw = at(s, u, v);
      else raw = at(u, s, v); // coronal
      let w = (raw - lo) / span;
      w = w < 0 ? 0 : w > 1 ? 1 : w;
      if (opts.invert) w = 1 - w;
      const g = Math.round(w * 255);
      img.data[o] = g;
      img.data[o + 1] = g;
      img.data[o + 2] = g;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  if (opts.crosshair) {
    const cx = viewport.x + opts.crosshair[0] * viewport.width;
    const cy = viewport.y + (1 - opts.crosshair[1]) * viewport.height;
    ctx.save();
    ctx.strokeStyle = 'rgba(99, 243, 172, 0.75)';
    ctx.lineWidth = Math.max(1, Math.min(width, height) / 360);
    ctx.setLineDash([Math.min(width, height) * 0.018, Math.min(width, height) * 0.014]);
    ctx.beginPath(); ctx.moveTo(cx, viewport.y); ctx.lineTo(cx, viewport.y + viewport.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(viewport.x, cy); ctx.lineTo(viewport.x + viewport.width, cy); ctx.stroke();
    ctx.restore();
  }
}

/** Which texture axis (0=x,1=y,2=z) is the slice axis for an orientation. */
export function sliceAxisFor(orientation: Orientation): 0 | 1 | 2 {
  return orientation === 'axial' ? 2 : orientation === 'sagittal' ? 0 : 1;
}
