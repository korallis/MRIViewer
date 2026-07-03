import dicomParser from 'dicom-parser';
import pako from 'pako';
import type { ParsedSlice, SliceMeta, Vec3, Vec6 } from './types';
import { isBigEndian, isDeflated, isLossy, isUncompressed } from './uids';
import { signExtend, maskUnsigned } from './intensity';

export class UnsupportedTransferSyntaxError extends Error {
  constructor(public readonly transferSyntaxUID: string) {
    super(`Unsupported transfer syntax: ${transferSyntaxUID}`);
  }
}

/** Part-10 magic: "DICM" at byte 128. Cheap folder filter — no extension sniffing. */
export function isDicom(bytes: Uint8Array): boolean {
  return (
    bytes.length > 132 &&
    bytes[128] === 0x44 && // D
    bytes[129] === 0x49 && // I
    bytes[130] === 0x43 && // C
    bytes[131] === 0x4d // M
  );
}

function splitDS(value: string | undefined): number[] {
  if (!value) return [];
  return value
    .split('\\')
    .map((s) => Number.parseFloat(s))
    .filter((n) => Number.isFinite(n));
}

function firstDS(value: string | undefined): number | null {
  const parts = splitDS(value);
  return parts.length > 0 ? parts[0]! : null;
}

/** Guard against allocation bombs from corrupt element lengths (PLAN §5.2). */
function sane(len: number, fileSize: number): boolean {
  return len >= 0 && len <= fileSize;
}

export function extractMeta(ds: dicomParser.DataSet, fileName: string): SliceMeta {
  const ippArr = splitDS(ds.string('x00200032'));
  const iopArr = splitDS(ds.string('x00200037'));
  const psArr = splitDS(ds.string('x00280030'));
  const transferSyntaxUID = ds.string('x00020010') ?? '1.2.840.10008.1.2';
  return {
    fileName,
    studyInstanceUID: ds.string('x0020000d') ?? 'UNKNOWN-STUDY',
    seriesInstanceUID: ds.string('x0020000e') ?? 'UNKNOWN-SERIES',
    sopInstanceUID: ds.string('x00080018') ?? '',
    sopClassUID: ds.string('x00080016') ?? '',
    transferSyntaxUID,
    modality: ds.string('x00080060') ?? '',
    seriesDescription: ds.string('x0008103e') ?? '',
    studyDescription: ds.string('x00081030') ?? '',
    patientName: ds.string('x00100010') ?? '',
    patientID: ds.string('x00100020') ?? '',
    patientBirthDate: ds.string('x00100030') ?? '',
    patientSex: ds.string('x00100040') ?? '',
    studyDate: ds.string('x00080020') ?? '',
    rows: ds.uint16('x00280010') ?? 0,
    columns: ds.uint16('x00280011') ?? 0,
    bitsAllocated: ds.uint16('x00280100') ?? 16,
    bitsStored: ds.uint16('x00280101') ?? ds.uint16('x00280100') ?? 16,
    highBit: ds.uint16('x00280102') ?? (ds.uint16('x00280101') ?? 16) - 1,
    pixelRepresentation: ds.uint16('x00280103') ?? 0,
    samplesPerPixel: ds.uint16('x00280002') ?? 1,
    photometricInterpretation: ds.string('x00280004') ?? 'MONOCHROME2',
    numberOfFrames: Number.parseInt(ds.string('x00280008') ?? '1', 10) || 1,
    ipp: ippArr.length === 3 ? (ippArr as Vec3) : null,
    iop: iopArr.length === 6 ? (iopArr as Vec6) : null,
    pixelSpacing: psArr.length === 2 ? [psArr[0]!, psArr[1]!] : null,
    rescaleSlope: firstDS(ds.string('x00281053')) ?? 1,
    rescaleIntercept: firstDS(ds.string('x00281052')) ?? 0,
    windowCenter: firstDS(ds.string('x00281050')),
    windowWidth: firstDS(ds.string('x00281051')),
    instanceNumber: firstDS(ds.string('x00200013')),
    echoNumber: firstDS(ds.string('x00180086')),
    temporalPosition: firstDS(ds.string('x00200100')),
    diffusionBValue: firstDS(ds.string('x00189087')),
    imageType: ds.string('x00080008') ?? '',
    lossySource: isLossy(transferSyntaxUID),
  };
}

export type FrameDecoder = (
  ds: dicomParser.DataSet,
  meta: SliceMeta,
  frameIndex: number,
) => Promise<Int16Array | Uint16Array | Uint8Array>;

/**
 * Extract uncompressed pixel samples for one frame. Applies sign extension /
 * high-bit masking so downstream code sees clean integers (PLAN §5.6).
 */
export function extractUncompressedFrame(
  ds: dicomParser.DataSet,
  meta: SliceMeta,
  frameIndex: number,
): Int16Array | Uint16Array | Uint8Array {
  const e = ds.elements['x7fe00010'];
  if (!e) throw new Error('Missing PixelData (7FE0,0010)');
  const nPix = meta.rows * meta.columns * meta.samplesPerPixel;
  const bytesPerSample = meta.bitsAllocated / 8;
  const frameBytes = nPix * bytesPerSample;
  const offset = e.dataOffset + frameIndex * frameBytes;
  if (!sane(offset + frameBytes - e.dataOffset, e.length) || offset + frameBytes > ds.byteArray.length) {
    throw new Error('PixelData shorter than declared frame size');
  }
  const buf = ds.byteArray.buffer;
  const byteOffset = ds.byteArray.byteOffset + offset;
  if (meta.bitsAllocated === 8) {
    // Copy out of the (large, shared) file buffer so it can be transferred alone.
    return new Uint8Array(buf, byteOffset, nPix).slice();
  }
  if (meta.bitsAllocated !== 16) {
    throw new Error(`Unsupported BitsAllocated: ${meta.bitsAllocated}`);
  }
  const raw = new Uint16Array(nPix);
  raw.set(new Uint16Array(buf, byteOffset, nPix));
  if (meta.pixelRepresentation === 1) {
    return signExtend(raw, meta.bitsStored);
  }
  return maskUnsigned(raw, meta.bitsStored, meta.highBit);
}

export interface ParseOptions {
  /** Decoder for compressed transfer syntaxes; absent → UnsupportedTransferSyntaxError. */
  decodeFrame?: FrameDecoder;
}

export function parseDataSet(bytes: Uint8Array): dicomParser.DataSet {
  // Deflated Explicit VR compresses the entire dataset after the file-meta group.
  return dicomParser.parseDicom(bytes, {
    inflater: (arr: Uint8Array, position: number) => {
      const inflated = pako.inflateRaw(arr.subarray(position));
      const full = new Uint8Array(position + inflated.length);
      full.set(arr.subarray(0, position));
      full.set(inflated, position);
      return full;
    },
  });
}

/** Parse a classic (single-frame) file into meta + decoded pixels. */
export async function parseSlice(
  bytes: Uint8Array,
  fileName: string,
  options: ParseOptions = {},
): Promise<ParsedSlice> {
  const ds = parseDataSet(bytes);
  const meta = extractMeta(ds, fileName);
  if (isBigEndian(meta.transferSyntaxUID)) {
    throw new UnsupportedTransferSyntaxError(meta.transferSyntaxUID);
  }
  let pixels: Int16Array | Uint16Array | Uint8Array;
  if (isUncompressed(meta.transferSyntaxUID) || isDeflated(meta.transferSyntaxUID)) {
    pixels = extractUncompressedFrame(ds, meta, 0);
  } else if (options.decodeFrame) {
    pixels = await options.decodeFrame(ds, meta, 0);
  } else {
    throw new UnsupportedTransferSyntaxError(meta.transferSyntaxUID);
  }
  return { meta, pixels };
}
