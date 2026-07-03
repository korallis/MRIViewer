import type { SliceMeta, SortedGeometry, Vec3 } from './types';

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function sliceNormal(iop: readonly number[]): Vec3 {
  const [r0, r1, r2, c0, c1, c2] = iop as [number, number, number, number, number, number];
  const n: Vec3 = [r1 * c2 - r2 * c1, r2 * c0 - r0 * c2, r0 * c1 - r1 * c0];
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / len, n[1] / len, n[2] / len];
}

/**
 * Geometric slice ordering (GDCM / nibabel / Clunie): sort by dot(normal, IPP).
 * NEVER InstanceNumber, SliceLocation, or filename (PLAN §5.4).
 * zSpacing from consecutive projected deltas — NEVER SliceThickness (§5.5).
 */
export function sortSlices(slices: SliceMeta[]): SortedGeometry {
  if (slices.length < 2) throw new Error('sortSlices requires >= 2 slices');
  const first = slices[0]!;
  if (!first.iop || !first.ipp) throw new Error('Missing IOP/IPP');
  const n = sliceNormal(first.iop);

  const keyed = slices.map((s, index) => {
    if (!s.ipp) throw new Error(`Missing IPP on ${s.fileName}`);
    return {
      index,
      ipp: s.ipp,
      d: n[0] * s.ipp[0] + n[1] * s.ipp[1] + n[2] * s.ipp[2],
    };
  });
  keyed.sort((a, b) => a.d - b.d);

  const deltas: number[] = [];
  for (let k = 1; k < keyed.length; k++) deltas.push(keyed[k]!.d - keyed[k - 1]!.d);
  const zSpacing = median(deltas);

  const DUP_EPS = 1e-4;
  let duplicatePositions = false;
  let missingSlices = false;
  let maxSpacingDeviation = 0;
  for (const d of deltas) {
    if (Math.abs(d) < DUP_EPS) {
      duplicatePositions = true;
      continue;
    }
    const ratio = d / zSpacing;
    const nearestInt = Math.round(ratio);
    if (nearestInt >= 2 && Math.abs(ratio - nearestInt) < 0.05) {
      missingSlices = true; // integer-multiple gap → dropped slices, render with warning
      continue;
    }
    maxSpacingDeviation = Math.max(maxSpacingDeviation, Math.abs(d - zSpacing) / Math.abs(zSpacing));
  }

  // Shear: in-plane component of consecutive IPP deltas should be ~0 (Slicer-style).
  let shearWarning = false;
  const SHEAR_TOL_MM = 0.01;
  for (let k = 1; k < keyed.length; k++) {
    const a = keyed[k - 1]!.ipp;
    const b = keyed[k]!.ipp;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const along = dx * n[0] + dy * n[1] + dz * n[2];
    const px = dx - along * n[0];
    const py = dy - along * n[1];
    const pz = dz - along * n[2];
    if (Math.hypot(px, py, pz) > SHEAR_TOL_MM) {
      shearWarning = true;
      break;
    }
  }

  return {
    order: keyed.map((k) => k.index),
    normal: n,
    zSpacing,
    maxSpacingDeviation,
    missingSlices,
    duplicatePositions,
    shearWarning,
  };
}
