import dcmjs from 'dcmjs';
import type { ParsedSlice, SliceMeta, Vec3, Vec6 } from './types';
import { signExtend, maskUnsigned } from './intensity';

/**
 * Enhanced (multi-frame) MR expansion (PLAN §5 / D7).
 * One file holds NumberOfFrames frames; geometry lives in Shared/PerFrame
 * Functional Groups, NOT the classic top-level tags (absent on Philips).
 * We expand one multiframe file into N pseudo-slices that flow through the
 * same series grouping + geometric sort + assembly as classic series.
 */

function num(v: unknown, fallback = 0): number {
  if (Array.isArray(v)) return typeof v[0] === 'number' ? v[0] : Number(v[0]) || fallback;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function arr(v: unknown): number[] {
  if (Array.isArray(v)) return v.map((x) => Number(x)).filter((x) => Number.isFinite(x));
  return [];
}

function first<T>(v: T | T[] | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function isMultiframe(bytes: Uint8Array): boolean {
  try {
    const dict = dcmjs.data.DicomMessage.readFile(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      { ignoreErrors: true },
    );
    const ds = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dict.dict);
    return num(ds.NumberOfFrames, 1) > 1;
  } catch {
    return false;
  }
}

export function parseMultiframe(bytes: Uint8Array, fileName: string): ParsedSlice[] {
  const dict = dcmjs.data.DicomMessage.readFile(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );
  const ds = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dict.dict);
  const frames = num(ds.NumberOfFrames, 1);
  const rows = num(ds.Rows);
  const cols = num(ds.Columns);
  const bitsAllocated = num(ds.BitsAllocated, 16);
  const bitsStored = num(ds.BitsStored, bitsAllocated);
  const highBit = num(ds.HighBit, bitsStored - 1);
  const pixelRepresentation = num(ds.PixelRepresentation, 0);
  const photometric = (ds.PhotometricInterpretation as string) ?? 'MONOCHROME2';

  const shared = first(ds.SharedFunctionalGroupsSequence) as Record<string, unknown> | undefined;
  const perFrame = (ds.PerFrameFunctionalGroupsSequence as Record<string, unknown>[]) ?? [];

  const sharedOrient = first(
    (first(shared?.PlaneOrientationSequence as unknown) as Record<string, unknown>)
      ?.ImageOrientationPatient as unknown,
  );
  const sharedIop = arr(
    (first(shared?.PlaneOrientationSequence as unknown) as Record<string, unknown>)
      ?.ImageOrientationPatient as unknown,
  );
  void sharedOrient;

  const pixelMeasures = first(shared?.PixelMeasuresSequence as unknown) as
    | Record<string, unknown>
    | undefined;
  const pixelSpacing = arr(pixelMeasures?.PixelSpacing as unknown);

  const rescaleShared = first(shared?.PixelValueTransformationSequence as unknown) as
    | Record<string, unknown>
    | undefined;
  const rescaleSlopeShared = num(rescaleShared?.RescaleSlope, 1);
  const rescaleInterceptShared = num(rescaleShared?.RescaleIntercept, 0);

  // Pixel data: dcmjs returns PixelData as an array of ArrayBuffers (one per
  // fragment for encapsulated; a single buffer for native). Assume native here.
  const pdRaw = ds.PixelData;
  const pdBuffer: ArrayBuffer = Array.isArray(pdRaw) ? (pdRaw[0] as ArrayBuffer) : (pdRaw as ArrayBuffer);
  const frameLen = rows * cols;
  const bytesPerSample = bitsAllocated / 8;

  const out: ParsedSlice[] = [];
  for (let f = 0; f < frames; f++) {
    const pf = perFrame[f] ?? {};
    const planePos = first(pf.PlanePositionSequence as unknown) as Record<string, unknown> | undefined;
    const ipp = arr(planePos?.ImagePositionPatient as unknown);
    const planeOrient = first(pf.PlaneOrientationSequence as unknown) as
      | Record<string, unknown>
      | undefined;
    const iop = arr(planeOrient?.ImageOrientationPatient as unknown);
    const frameIop = iop.length === 6 ? iop : sharedIop;

    const pfPixelMeasures = first(pf.PixelMeasuresSequence as unknown) as
      | Record<string, unknown>
      | undefined;
    const framePixelSpacing = arr(pfPixelMeasures?.PixelSpacing as unknown);
    const ps = framePixelSpacing.length === 2 ? framePixelSpacing : pixelSpacing;

    const pfRescale = first(pf.PixelValueTransformationSequence as unknown) as
      | Record<string, unknown>
      | undefined;
    const rescaleSlope = pfRescale ? num(pfRescale.RescaleSlope, rescaleSlopeShared) : rescaleSlopeShared;
    const rescaleIntercept = pfRescale
      ? num(pfRescale.RescaleIntercept, rescaleInterceptShared)
      : rescaleInterceptShared;

    const meta: SliceMeta = {
      fileName: `${fileName}#${f}`,
      studyInstanceUID: (ds.StudyInstanceUID as string) ?? 'UNKNOWN-STUDY',
      seriesInstanceUID: (ds.SeriesInstanceUID as string) ?? 'UNKNOWN-SERIES',
      sopInstanceUID: `${(ds.SOPInstanceUID as string) ?? fileName}#${f}`,
      sopClassUID: (ds.SOPClassUID as string) ?? '',
      transferSyntaxUID: (dict.meta?.TransferSyntaxUID as { Value?: string[] })?.Value?.[0] ?? '1.2.840.10008.1.2.1',
      modality: (ds.Modality as string) ?? 'MR',
      seriesDescription: (ds.SeriesDescription as string) ?? '',
      studyDescription: (ds.StudyDescription as string) ?? '',
      patientName: String(ds.PatientName ?? ''),
      patientID: (ds.PatientID as string) ?? '',
      patientBirthDate: (ds.PatientBirthDate as string) ?? '',
      patientSex: (ds.PatientSex as string) ?? '',
      studyDate: (ds.StudyDate as string) ?? '',
      rows,
      columns: cols,
      bitsAllocated,
      bitsStored,
      highBit,
      pixelRepresentation,
      samplesPerPixel: num(ds.SamplesPerPixel, 1),
      photometricInterpretation: photometric,
      numberOfFrames: 1, // expanded → each pseudo-slice is single-frame downstream
      ipp: ipp.length === 3 ? (ipp as Vec3) : null,
      iop: frameIop.length === 6 ? (frameIop as Vec6) : null,
      pixelSpacing: ps.length === 2 ? [ps[0]!, ps[1]!] : null,
      rescaleSlope,
      rescaleIntercept,
      windowCenter: num(ds.WindowCenter, NaN) || null,
      windowWidth: num(ds.WindowWidth, NaN) || null,
      instanceNumber: f + 1,
      echoNumber: null,
      temporalPosition: null,
      diffusionBValue: null,
      imageType: Array.isArray(ds.ImageType) ? ds.ImageType.join('\\') : String(ds.ImageType ?? ''),
      lossySource: false,
    };

    const byteOffset = f * frameLen * bytesPerSample;
    let pixels: Int16Array | Uint16Array | Uint8Array;
    if (bitsAllocated === 8) {
      pixels = new Uint8Array(pdBuffer, byteOffset, frameLen).slice();
    } else {
      const raw = new Uint16Array(frameLen);
      raw.set(new Uint16Array(pdBuffer, byteOffset, frameLen));
      pixels =
        pixelRepresentation === 1 ? signExtend(raw, bitsStored) : maskUnsigned(raw, bitsStored, highBit);
    }
    out.push({ meta, pixels });
  }
  return out;
}
