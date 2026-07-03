export type Vec3 = [number, number, number];
export type Vec6 = [number, number, number, number, number, number];

export interface SliceMeta {
  fileName: string;
  studyInstanceUID: string;
  seriesInstanceUID: string;
  sopInstanceUID: string;
  sopClassUID: string;
  transferSyntaxUID: string;
  modality: string;
  seriesDescription: string;
  studyDescription: string;
  patientName: string;
  patientID: string;
  patientBirthDate: string;
  patientSex: string;
  studyDate: string;
  rows: number;
  columns: number;
  bitsAllocated: number;
  bitsStored: number;
  highBit: number;
  pixelRepresentation: number;
  samplesPerPixel: number;
  photometricInterpretation: string;
  numberOfFrames: number;
  /** ImagePositionPatient (0020,0032) — mm position of the center of the first voxel, LPS. */
  ipp: Vec3 | null;
  /** ImageOrientationPatient (0020,0037) — row then column direction cosines, LPS. */
  iop: Vec6 | null;
  /** PixelSpacing (0028,0030) — [rowSpacing, columnSpacing] mm. Row spacing FIRST. */
  pixelSpacing: [number, number] | null;
  rescaleSlope: number;
  rescaleIntercept: number;
  windowCenter: number | null;
  windowWidth: number | null;
  instanceNumber: number | null;
  echoNumber: number | null;
  temporalPosition: number | null;
  diffusionBValue: number | null;
  imageType: string;
  /** True when pixel data is lossy-compressed at source (TS .4.50/.51/.91 etc.). */
  lossySource: boolean;
}

export interface ParsedSlice {
  meta: SliceMeta;
  /** Decoded pixel samples. Signed data is already sign-extended to Int16. */
  pixels: Int16Array | Uint16Array | Uint8Array;
}

export interface SortedGeometry {
  /** Indices into the input slice array, in ascending dot(normal, IPP) order. */
  order: number[];
  /** Slice normal = cross(rowCosines, colCosines), unit length. */
  normal: Vec3;
  /** Median distance between consecutive projected slice positions, mm. */
  zSpacing: number;
  /** Max relative deviation of consecutive deltas from the median. */
  maxSpacingDeviation: number;
  /** Any consecutive delta is ~an integer multiple (>=2) of the median → dropped slices. */
  missingSlices: boolean;
  /** Any consecutive delta ≈ 0 → multiple images at one position (4D data). */
  duplicatePositions: boolean;
  /** In-plane component of consecutive IPP deltas exceeds tolerance → sheared/irregular. */
  shearWarning: boolean;
}

export interface VolumeCandidate {
  key: string;
  studyInstanceUID: string;
  seriesInstanceUID: string;
  description: string;
  /** Sub-volume discriminator when a series was split (echo, temporal, orientation). */
  splitLabel: string | null;
  slices: SliceMeta[];
  reconstructable: boolean;
  warnings: string[];
  errors: string[];
  sorted: SortedGeometry | null;
}

export interface AssembledVolume {
  /** [nx (columns), ny (rows), nz (slices)] */
  dims: Vec3;
  /** [colSpacing, rowSpacing, zSpacing] mm — voxel size along x/y/z of the volume grid. */
  spacing: Vec3;
  /** Intensities normalized to [0,1] over the full data range (windowing is a view op). */
  data: Float32Array;
  /** Row-major 4x4: voxel index (i,j,k,1) → patient LPS mm. */
  lpsFromVoxel: number[];
  /** Default window [lo,hi] in normalized units (robust percentiles or DICOM tags). */
  window: [number, number];
  /** Raw (rescaled) intensity range before normalization. */
  range: [number, number];
  meta: SliceMeta;
  warnings: string[];
}
