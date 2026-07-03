import * as THREE from 'three';

export type ColormapName = 'gray' | 'viridis' | 'hot-iron';

type Anchor = [number, number, number];

const ANCHORS: Record<ColormapName, Anchor[]> = {
  gray: [
    [0, 0, 0],
    [255, 255, 255],
  ],
  viridis: [
    [68, 1, 84],
    [71, 44, 122],
    [59, 81, 139],
    [44, 113, 142],
    [33, 144, 141],
    [39, 173, 129],
    [92, 200, 99],
    [170, 220, 50],
    [253, 231, 37],
  ],
  'hot-iron': [
    [0, 0, 0],
    [128, 0, 0],
    [255, 0, 0],
    [255, 128, 0],
    [255, 255, 0],
    [255, 255, 255],
  ],
};

/** Default opacity ramp for DVR — replaced by the TF editor's control points. */
export function defaultOpacity(w: number): number {
  return Math.min(0.9, Math.pow(w, 1.7));
}

export function buildLutData(
  name: ColormapName,
  opacity: (w: number) => number = defaultOpacity,
): Uint8Array {
  const anchors = ANCHORS[name];
  const data = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const w = i / 255;
    const f = w * (anchors.length - 1);
    const i0 = Math.min(anchors.length - 2, Math.floor(f));
    const t = f - i0;
    const a = anchors[i0]!;
    const b = anchors[i0 + 1]!;
    data[i * 4] = Math.round(a[0] + (b[0] - a[0]) * t);
    data[i * 4 + 1] = Math.round(a[1] + (b[1] - a[1]) * t);
    data[i * 4 + 2] = Math.round(a[2] + (b[2] - a[2]) * t);
    data[i * 4 + 3] = Math.round(opacity(w) * 255);
  }
  return data;
}

const cache = new Map<string, THREE.DataTexture>();

export function getLutTexture(
  name: ColormapName,
  opacity?: (w: number) => number,
  cacheKey = name,
): THREE.DataTexture {
  const existing = cache.get(cacheKey);
  if (existing && !opacity) return existing;
  const tex = existing ?? new THREE.DataTexture(buildLutData(name, opacity), 256, 1, THREE.RGBAFormat);
  if (existing) {
    tex.image.data = buildLutData(name, opacity) as unknown as Uint8ClampedArray;
  }
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true; // stays LINEAR colorspace — no sRGB transform on data (PLAN §6)
  cache.set(cacheKey, tex);
  return tex;
}

export const COLORMAPS: ColormapName[] = ['gray', 'viridis', 'hot-iron'];
