import type { AssembledVolume } from '../dicom/types';

/**
 * Anatomical direction labels from direction cosines (PLAN §6).
 * World is RAS: +X=Right, +Y=Anterior, +Z=Superior.
 */
export function labelForWorldDir(dir: readonly number[]): string {
  const ax = Math.abs(dir[0]!);
  const ay = Math.abs(dir[1]!);
  const az = Math.abs(dir[2]!);
  if (ax >= ay && ax >= az) return dir[0]! >= 0 ? 'R' : 'L';
  if (ay >= az) return dir[1]! >= 0 ? 'A' : 'P';
  return dir[2]! >= 0 ? 'S' : 'I';
}

/** Patient direction (RAS world) of a texture-space axis (0=u,1=v,2=w). */
export function textureAxisWorldDir(volume: AssembledVolume, axis: 0 | 1 | 2): number[] {
  const m = volume.lpsFromVoxel;
  // Column `axis` of the LPS affine rotation part, then LPS→RAS flip.
  const lps = [m[axis]!, m[4 + axis]!, m[8 + axis]!];
  const len = Math.hypot(lps[0]!, lps[1]!, lps[2]!) || 1;
  return [-lps[0]! / len, -lps[1]! / len, lps[2]! / len];
}

export interface PaneAxes {
  /** Texture axis index sampled along screen-x, with sign. */
  uAxis: 0 | 1 | 2;
  uSign: 1 | -1;
  vAxis: 0 | 1 | 2;
  vSign: 1 | -1;
  /** The remaining texture axis — the slice-scrub direction. */
  sliceAxis: 0 | 1 | 2;
  sliceSign: 1 | -1;
  /** Edge labels [left, right, top, bottom]. */
  labels: [string, string, string, string];
}

const PANE_TARGETS: Record<'axial' | 'sagittal' | 'coronal', { x: number[]; yUp: number[] }> = {
  // Radiological convention: patient LEFT on screen-RIGHT for axial/coronal.
  axial: { x: [-1, 0, 0], yUp: [0, 1, 0] }, // screen-x → patient Left (−X RAS), screen-up → Anterior
  coronal: { x: [-1, 0, 0], yUp: [0, 0, 1] }, // screen-up → Superior
  sagittal: { x: [0, -1, 0], yUp: [0, 0, 1] }, // screen-x → Posterior, screen-up → Superior
};

/**
 * Choose which texture axes a 2D pane samples: for each desired screen
 * direction pick the texture axis whose patient direction dominates it.
 * Exact for orthogonal acquisitions, nearest-fit for oblique ones.
 */
export function paneAxes(
  volume: AssembledVolume,
  pane: 'axial' | 'sagittal' | 'coronal',
  convention: 'radiological' | 'neurological',
): PaneAxes {
  const dirs = [0, 1, 2].map((a) => textureAxisWorldDir(volume, a as 0 | 1 | 2));
  const target = PANE_TARGETS[pane];
  const tx = [...target.x];
  if (convention === 'neurological' && pane !== 'sagittal') {
    tx[0] = -tx[0]!;
    tx[1] = -tx[1]!;
    tx[2] = -tx[2]!;
  }

  const pick = (want: number[], exclude: number[]): { axis: 0 | 1 | 2; sign: 1 | -1 } => {
    let best = -1;
    let bestDot = 0;
    for (let a = 0; a < 3; a++) {
      if (exclude.includes(a)) continue;
      const d = dirs[a]![0]! * want[0]! + dirs[a]![1]! * want[1]! + dirs[a]![2]! * want[2]!;
      if (Math.abs(d) > Math.abs(bestDot)) {
        bestDot = d;
        best = a;
      }
    }
    return { axis: best as 0 | 1 | 2, sign: bestDot >= 0 ? 1 : -1 };
  };

  const u = pick(tx, []);
  const v = pick(target.yUp, [u.axis]);
  const sliceAxis = ([0, 1, 2].find((a) => a !== u.axis && a !== v.axis) ?? 2) as 0 | 1 | 2;

  const uDir = dirs[u.axis]!.map((c) => c * u.sign);
  const vDir = dirs[v.axis]!.map((c) => c * v.sign);
  return {
    uAxis: u.axis,
    uSign: u.sign,
    vAxis: v.axis,
    vSign: v.sign,
    sliceAxis,
    sliceSign: 1,
    labels: [
      labelForWorldDir(uDir.map((c) => -c)), // left edge = −screen-x
      labelForWorldDir(uDir), // right edge
      labelForWorldDir(vDir), // top edge = +screen-up
      labelForWorldDir(vDir.map((c) => -c)), // bottom edge
    ],
  };
}
