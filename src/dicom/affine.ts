import type { Vec3 } from './types';

/**
 * Row-major 4x4 mapping voxel index (i=column, j=row, k=slice) → patient LPS mm.
 * Per DICOM PS3.3 C.7.6.2: stepping along a row (i) moves in the ROW direction
 * cosines by the COLUMN spacing (PixelSpacing[1]); stepping down rows (j) moves
 * in the COLUMN direction cosines by the ROW spacing (PixelSpacing[0]).
 */
export function lpsFromVoxelMatrix(
  iop: readonly number[],
  pixelSpacing: readonly [number, number],
  ippFirst: Vec3,
  normal: Vec3,
  zSpacing: number,
): number[] {
  const [r0, r1, r2, c0, c1, c2] = iop as [number, number, number, number, number, number];
  const [rowSp, colSp] = pixelSpacing;
  // prettier-ignore
  return [
    r0 * colSp, c0 * rowSp, normal[0] * zSpacing, ippFirst[0],
    r1 * colSp, c1 * rowSp, normal[1] * zSpacing, ippFirst[1],
    r2 * colSp, c2 * rowSp, normal[2] * zSpacing, ippFirst[2],
    0, 0, 0, 1,
  ];
}

/** Apply row-major 4x4 to a point. */
export function applyMat4(m: readonly number[], p: Vec3): Vec3 {
  return [
    m[0]! * p[0] + m[1]! * p[1] + m[2]! * p[2] + m[3]!,
    m[4]! * p[0] + m[5]! * p[1] + m[6]! * p[2] + m[7]!,
    m[8]! * p[0] + m[9]! * p[1] + m[10]! * p[2] + m[11]!,
  ];
}

/** World = RAS (X=Right, Y=Anterior, Z=Superior): LPS→RAS negates X and Y (PLAN §6). */
export function lpsToRas(p: Vec3): Vec3 {
  return [-p[0], -p[1], p[2]];
}

/** Invert an affine 4x4 (row-major) with a general 3x3 inverse + translation. */
export function invertAffine(m: readonly number[]): number[] {
  const a = m[0]!, b = m[1]!, c = m[2]!;
  const d = m[4]!, e = m[5]!, f = m[6]!;
  const g = m[8]!, h = m[9]!, i = m[10]!;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) throw new Error('Singular affine');
  const inv = 1 / det;
  const r00 = (e * i - f * h) * inv;
  const r01 = (c * h - b * i) * inv;
  const r02 = (b * f - c * e) * inv;
  const r10 = (f * g - d * i) * inv;
  const r11 = (a * i - c * g) * inv;
  const r12 = (c * d - a * f) * inv;
  const r20 = (d * h - e * g) * inv;
  const r21 = (b * g - a * h) * inv;
  const r22 = (a * e - b * d) * inv;
  const tx = m[3]!, ty = m[7]!, tz = m[11]!;
  // prettier-ignore
  return [
    r00, r01, r02, -(r00 * tx + r01 * ty + r02 * tz),
    r10, r11, r12, -(r10 * tx + r11 * ty + r12 * tz),
    r20, r21, r22, -(r20 * tx + r21 * ty + r22 * tz),
    0, 0, 0, 1,
  ];
}
