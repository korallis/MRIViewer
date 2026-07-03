export const TransferSyntax = {
  ImplicitVRLittleEndian: '1.2.840.10008.1.2',
  ExplicitVRLittleEndian: '1.2.840.10008.1.2.1',
  DeflatedExplicitVRLittleEndian: '1.2.840.10008.1.2.1.99',
  ExplicitVRBigEndian: '1.2.840.10008.1.2.2',
  JPEGBaseline8Bit: '1.2.840.10008.1.2.4.50',
  JPEGExtended12Bit: '1.2.840.10008.1.2.4.51',
  JPEGLossless: '1.2.840.10008.1.2.4.57',
  JPEGLosslessSV1: '1.2.840.10008.1.2.4.70',
  JPEGLSLossless: '1.2.840.10008.1.2.4.80',
  JPEGLSNearLossless: '1.2.840.10008.1.2.4.81',
  JPEG2000Lossless: '1.2.840.10008.1.2.4.90',
  JPEG2000: '1.2.840.10008.1.2.4.91',
  // HTJ2K — canonical .4.20x UIDs (the dicom-codec README has a typo; PLAN §4).
  HTJ2KLossless: '1.2.840.10008.1.2.4.201',
  HTJ2KLosslessRPCL: '1.2.840.10008.1.2.4.202',
  HTJ2K: '1.2.840.10008.1.2.4.203',
  RLELossless: '1.2.840.10008.1.2.5',
} as const;

export const SOPClass = {
  MRImageStorage: '1.2.840.10008.5.1.4.1.1.4',
  EnhancedMRImageStorage: '1.2.840.10008.5.1.4.1.1.4.1',
} as const;

const UNCOMPRESSED = new Set<string>([
  TransferSyntax.ImplicitVRLittleEndian,
  TransferSyntax.ExplicitVRLittleEndian,
]);

const LOSSY = new Set<string>([
  TransferSyntax.JPEGBaseline8Bit,
  TransferSyntax.JPEGExtended12Bit,
  TransferSyntax.JPEG2000,
  TransferSyntax.HTJ2K,
]);

export const isUncompressed = (ts: string): boolean => UNCOMPRESSED.has(ts);
export const isLossy = (ts: string): boolean => LOSSY.has(ts);
export const isDeflated = (ts: string): boolean =>
  ts === TransferSyntax.DeflatedExplicitVRLittleEndian;
export const isBigEndian = (ts: string): boolean => ts === TransferSyntax.ExplicitVRBigEndian;
