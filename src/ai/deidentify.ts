import type { AssembledVolume } from '../dicom/types';

/**
 * Build a de-identified study context for the AI companion (PLAN §9 / PHI).
 * ONLY technical/protocol descriptors leave the device — never PatientName,
 * PatientID, birth date, sex, study date, institution, accession, or any UID.
 */
export interface StudyContext {
  modality: string;
  seriesDescription: string;
  studyDescription: string;
  dimensions: string;
  spacingMm: string;
  bitsStored: number;
  signed: boolean;
  photometric: string;
  transferSyntax: string;
  voxelCount: number;
  intensityRange: string;
}

/** Fields deliberately excluded — kept here as a visible allowlist audit trail. */
export const EXCLUDED_PHI_FIELDS = [
  'PatientName',
  'PatientID',
  'PatientBirthDate',
  'PatientSex',
  'StudyDate',
  'StudyInstanceUID',
  'SeriesInstanceUID',
  'SOPInstanceUID',
  'AccessionNumber',
  'InstitutionName',
  'ReferringPhysician',
] as const;

export function buildStudyContext(volume: AssembledVolume): StudyContext {
  const m = volume.meta;
  return {
    modality: m.modality || 'unknown',
    seriesDescription: m.seriesDescription || '(none)',
    studyDescription: m.studyDescription || '(none)',
    dimensions: volume.dims.join(' × '),
    spacingMm: volume.spacing.map((s) => s.toFixed(2)).join(' × '),
    bitsStored: m.bitsStored,
    signed: m.pixelRepresentation === 1,
    photometric: m.photometricInterpretation,
    transferSyntax: m.transferSyntaxUID,
    voxelCount: volume.dims[0] * volume.dims[1] * volume.dims[2],
    intensityRange: `${volume.range[0].toFixed(1)} … ${volume.range[1].toFixed(1)} (arbitrary MR units)`,
  };
}

export function contextToText(ctx: StudyContext): string {
  return [
    `Modality: ${ctx.modality}`,
    `Study: ${ctx.studyDescription}`,
    `Series: ${ctx.seriesDescription}`,
    `Volume: ${ctx.dimensions} voxels, spacing ${ctx.spacingMm} mm (${ctx.voxelCount.toLocaleString()} voxels)`,
    `Pixel format: ${ctx.bitsStored}-bit ${ctx.signed ? 'signed' : 'unsigned'}, ${ctx.photometric}`,
    `Encoding: ${ctx.transferSyntax}`,
    `Intensity range: ${ctx.intensityRange}`,
  ].join('\n');
}
