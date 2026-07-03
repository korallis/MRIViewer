import type { SliceMeta, VolumeCandidate } from './types';
import { sortSlices } from './sort';

/** IOP rounded for grouping — tolerance-compatible with OHIF's 0.01 per component. */
function iopKey(iop: readonly number[] | null): string {
  if (!iop) return 'no-iop';
  return iop.map((v) => v.toFixed(2)).join(',');
}

function pick4DLabel(s: SliceMeta): string {
  const parts: string[] = [];
  if (s.echoNumber != null) parts.push(`echo${s.echoNumber}`);
  if (s.temporalPosition != null) parts.push(`t${s.temporalPosition}`);
  if (s.diffusionBValue != null) parts.push(`b${s.diffusionBValue}`);
  return parts.join(' ');
}

/**
 * SeriesInstanceUID alone is not a volume (PLAN §5.3): split further by
 * orientation, then by 4D tags when multiple images share a spatial position.
 */
export function groupIntoCandidates(all: SliceMeta[], max3DTextureSize = 2048): VolumeCandidate[] {
  const bySeries = new Map<string, SliceMeta[]>();
  for (const s of all) {
    const key = `${s.studyInstanceUID}|${s.seriesInstanceUID}|${iopKey(s.iop)}|${s.rows}x${s.columns}`;
    const arr = bySeries.get(key);
    if (arr) arr.push(s);
    else bySeries.set(key, [s]);
  }

  const candidates: VolumeCandidate[] = [];
  for (const [key, slices] of bySeries) {
    // Detect duplicate spatial positions → split by 4D discriminator.
    const positions = new Set<string>();
    let hasDuplicates = false;
    for (const s of slices) {
      const p = s.ipp ? s.ipp.map((v) => v.toFixed(3)).join(',') : s.fileName;
      if (positions.has(p)) {
        hasDuplicates = true;
        break;
      }
      positions.add(p);
    }

    let groups: Array<{ label: string | null; slices: SliceMeta[] }>;
    if (hasDuplicates) {
      const byLabel = new Map<string, SliceMeta[]>();
      for (const s of slices) {
        const label = pick4DLabel(s) || 'sub0';
        const arr = byLabel.get(label);
        if (arr) arr.push(s);
        else byLabel.set(label, [s]);
      }
      groups = [...byLabel.entries()].map(([label, g]) => ({ label, slices: g }));
    } else {
      groups = [{ label: null, slices }];
    }

    for (const g of groups) {
      candidates.push(buildCandidate(key, g.label, g.slices, max3DTextureSize));
    }
  }
  // Default-selection heuristic: largest reconstructable series first.
  candidates.sort((a, b) => Number(b.reconstructable) - Number(a.reconstructable) || b.slices.length - a.slices.length);
  return candidates;
}

function buildCandidate(
  key: string,
  splitLabel: string | null,
  slices: SliceMeta[],
  max3DTextureSize: number,
): VolumeCandidate {
  const first = slices[0]!;
  const warnings: string[] = [];
  const errors: string[] = [];
  let sorted = null;
  let reconstructable = true;

  if (first.numberOfFrames > 1) {
    errors.push('Enhanced multi-frame series — assembled via the multi-frame path');
  }
  if (slices.length < 2) {
    errors.push('Single-slice series is not reconstructable as a volume');
    reconstructable = false;
  } else if (!first.iop || slices.some((s) => !s.ipp)) {
    errors.push('Missing ImageOrientationPatient / ImagePositionPatient');
    reconstructable = false;
  } else if (!first.pixelSpacing) {
    errors.push('Missing PixelSpacing');
    reconstructable = false;
  } else {
    try {
      sorted = sortSlices(slices);
      if (sorted.duplicatePositions) {
        errors.push('Multiple images at the same position (unsplit 4D data)');
        reconstructable = false;
      }
      if (sorted.maxSpacingDeviation > 0.2) {
        errors.push(
          `Irregular slice spacing (${(sorted.maxSpacingDeviation * 100).toFixed(0)}% deviation)`,
        );
        reconstructable = false;
      } else if (sorted.maxSpacingDeviation > 0.02) {
        warnings.push('Slightly non-uniform slice spacing (>2% deviation)');
      }
      if (sorted.missingSlices) warnings.push('Gaps detected — some slices appear to be missing');
      if (sorted.shearWarning) warnings.push('Irregular volume geometry (sheared slice positions)');
      if (Math.abs(sorted.zSpacing) < 1e-6) {
        errors.push('Zero slice spacing');
        reconstructable = false;
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      reconstructable = false;
    }
  }
  if (first.rows > max3DTextureSize || first.columns > max3DTextureSize) {
    warnings.push(`Slice dimensions exceed GPU 3D texture limit (${max3DTextureSize}) — will downsample`);
  }
  if (first.samplesPerPixel !== 1) {
    errors.push('Color (multi-sample) images are not supported for volume rendering');
    reconstructable = false;
  }

  const description = first.seriesDescription || first.seriesInstanceUID.slice(-12);
  return {
    key: splitLabel ? `${key}|${splitLabel}` : key,
    studyInstanceUID: first.studyInstanceUID,
    seriesInstanceUID: first.seriesInstanceUID,
    description: splitLabel ? `${description} [${splitLabel}]` : description,
    splitLabel,
    slices,
    reconstructable,
    warnings,
    errors,
    sorted,
  };
}
