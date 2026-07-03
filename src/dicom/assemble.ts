import type { AssembledVolume, ParsedSlice, Vec3, VolumeCandidate } from './types';
import { lpsFromVoxelMatrix } from './affine';
import { robustRange } from './intensity';

/**
 * Assemble sorted, decoded slices into a normalized Float32 volume (PLAN §5.6).
 * Pipeline: rescale → (MONOCHROME1 invert) → percentile window → normalize [0,1].
 */
export function assembleVolume(
  candidate: VolumeCandidate,
  parsed: Map<string, ParsedSlice>,
): AssembledVolume {
  const sorted = candidate.sorted;
  if (!sorted || !candidate.reconstructable) {
    throw new Error(`Candidate not reconstructable: ${candidate.errors.join('; ')}`);
  }
  const slices = candidate.slices;
  const first = slices[0]!;
  const nx = first.columns;
  const ny = first.rows;
  const nz = slices.length;
  const sliceLen = nx * ny;
  const data = new Float32Array(sliceLen * nz);

  let min = Infinity;
  let max = -Infinity;
  const orderedMetas = sorted.order.map((idx) => slices[idx]!);
  for (let k = 0; k < nz; k++) {
    const meta = orderedMetas[k]!;
    const p = parsed.get(meta.sopInstanceUID);
    if (!p) throw new Error(`Missing pixel data for ${meta.fileName}`);
    if (p.pixels.length < sliceLen) {
      throw new Error(`Pixel data shorter than Rows×Columns in ${meta.fileName}`);
    }
    const slope = meta.rescaleSlope;
    const intercept = meta.rescaleIntercept;
    const base = k * sliceLen;
    const px = p.pixels;
    for (let i = 0; i < sliceLen; i++) {
      const v = px[i]! * slope + intercept;
      data[base + i] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }

  if (first.photometricInterpretation === 'MONOCHROME1') {
    for (let i = 0; i < data.length; i++) data[i] = min + max - data[i]!;
  }

  const [pLo, pHi] = robustRange(data, min, max);
  const range = max - min || 1;
  for (let i = 0; i < data.length; i++) data[i] = (data[i]! - min) / range;

  // Default window: DICOM tags when present, else robust percentiles — normalized units.
  let winLo = (pLo - min) / range;
  let winHi = (pHi - min) / range;
  if (first.windowCenter != null && first.windowWidth != null && first.windowWidth >= 1) {
    const lo = first.windowCenter - first.windowWidth / 2;
    const hi = first.windowCenter + first.windowWidth / 2;
    winLo = Math.max(0, (lo - min) / range);
    winHi = Math.min(1, (hi - min) / range);
    if (winHi <= winLo) {
      winLo = (pLo - min) / range;
      winHi = (pHi - min) / range;
    }
  }

  const firstSorted = orderedMetas[0]!;
  const spacing: Vec3 = [
    first.pixelSpacing![1], // x = column spacing
    first.pixelSpacing![0], // y = row spacing
    Math.abs(sorted.zSpacing),
  ];
  const lpsFromVoxel = lpsFromVoxelMatrix(
    first.iop!,
    first.pixelSpacing!,
    firstSorted.ipp!,
    sorted.normal,
    sorted.zSpacing,
  );

  return {
    dims: [nx, ny, nz],
    spacing,
    data,
    lpsFromVoxel,
    window: [winLo, winHi],
    range: [min, max],
    meta: first,
    warnings: [...candidate.warnings],
  };
}
