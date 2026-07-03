/**
 * Synthetic DICOM phantom generator (PLAN §10).
 *
 * Deterministic, asymmetric, anisotropic — makes orientation, sorting, spacing
 * and intensity handling machine-checkable:
 *  - background gradient  v = i + 2j + 4k
 *  - bright MARKER (3000) in the patient Left-Anterior-Superior octant
 *  - 40 mm ROD (2500) along +X for measurement tests
 *  - spacing 1×1×2.5 mm with SliceThickness=2.0 (a trap: z-spacing must come
 *    from IPP deltas, never SliceThickness)
 *  - InstanceNumber REVERSED and filenames shuffled (a trap: geometric sort only)
 */
import dcmjs from 'dcmjs';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

export const NX = 64;
export const NY = 64;
export const NZ = 24;
export const ROW_SP = 1.0;
export const COL_SP = 1.0;
export const Z_SP = 2.5;

export const MARKER = { i: [40, 56], j: [8, 24], k: [14, 22], value: 3000 } as const;
export const ROD = { i: [10, 50], j: [31, 34], k: [11, 13], value: 2500 } as const;

const UID_ROOT = '1.2.826.0.1.3680043.8.498.77';

function nameHash(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 100000;
  return h;
}

function baseValue(i: number, j: number, k: number): number {
  if (
    i >= MARKER.i[0] && i < MARKER.i[1] &&
    j >= MARKER.j[0] && j < MARKER.j[1] &&
    k >= MARKER.k[0] && k < MARKER.k[1]
  ) {
    return MARKER.value;
  }
  if (
    i >= ROD.i[0] && i <= ROD.i[1] &&
    j >= ROD.j[0] && j < ROD.j[1] &&
    k >= ROD.k[0] && k < ROD.k[1]
  ) {
    return ROD.value;
  }
  return i + 2 * j + 4 * k;
}

function sliceValues(k: number): Uint16Array {
  const out = new Uint16Array(NX * NY);
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      out[j * NX + i] = baseValue(i, j, k);
    }
  }
  return out;
}

/** Deterministic LCG shuffle — Date/Math.random-free for reproducible fixtures. */
function shuffled(n: number, seed = 42): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  return idx;
}

interface SliceSpec {
  k: number;
  pixels: Uint16Array | Int16Array;
  iop: number[];
  ipp: number[];
  transferSyntax: string;
  photometric: string;
  bitsStored: number;
  highBit: number;
  pixelRepresentation: number;
  seriesUID: string;
  seriesDescription: string;
  sopUID: string;
  instanceNumber: number;
  echoNumber?: number;
}

function writeSliceFile(dir: string, name: string, spec: SliceSpec): void {
  const { DicomDict, DicomMetaDictionary } = dcmjs.data;
  const dataset: Record<string, unknown> = {
    SOPClassUID: '1.2.840.10008.5.1.4.1.1.4',
    SOPInstanceUID: spec.sopUID,
    StudyInstanceUID: `${UID_ROOT}.1`,
    SeriesInstanceUID: spec.seriesUID,
    Modality: 'MR',
    PatientName: 'PHANTOM^MRIVIEWER',
    PatientID: 'PHM001',
    PatientBirthDate: '20000101',
    PatientSex: 'O',
    StudyDate: '20260703',
    StudyDescription: 'MRIViewer synthetic phantom',
    SeriesDescription: spec.seriesDescription,
    ImageType: 'ORIGINAL\\PRIMARY',
    InstanceNumber: spec.instanceNumber,
    Rows: NY,
    Columns: NX,
    BitsAllocated: 16,
    BitsStored: spec.bitsStored,
    HighBit: spec.highBit,
    PixelRepresentation: spec.pixelRepresentation,
    SamplesPerPixel: 1,
    PhotometricInterpretation: spec.photometric,
    PixelSpacing: [ROW_SP, COL_SP],
    SliceThickness: 2.0, // deliberately != real z spacing (2.5)
    ImageOrientationPatient: spec.iop,
    ImagePositionPatient: spec.ipp,
    ...(spec.echoNumber != null ? { EchoNumbers: spec.echoNumber } : {}),
    PixelData: spec.pixels.buffer.slice(
      spec.pixels.byteOffset,
      spec.pixels.byteOffset + spec.pixels.byteLength,
    ),
    _vrMap: { PixelData: 'OW' },
  };
  const meta: Record<string, unknown> = {
    FileMetaInformationVersion: new Uint8Array([0, 1]).buffer,
    MediaStorageSOPClassUID: dataset.SOPClassUID,
    MediaStorageSOPInstanceUID: dataset.SOPInstanceUID,
    TransferSyntaxUID: spec.transferSyntax,
    ImplementationClassUID: `${UID_ROOT}.99`,
    ImplementationVersionName: 'MRIVIEWER',
  };
  const dict = new DicomDict(DicomMetaDictionary.denaturalizeDataset(meta));
  dict.dict = DicomMetaDictionary.denaturalizeDataset(dataset);
  writeFileSync(join(dir, name), Buffer.from(dict.write()));
}

interface VariantOptions {
  name: string;
  description: string;
  transferSyntax?: string;
  iop?: number[];
  ippFor?: (k: number) => number[];
  transform?: (v: number) => number;
  photometric?: string;
  bitsStored?: number;
  pixelRepresentation?: number;
  skipSlices?: number[];
  echoes?: number[];
}

function writeVariant(opts: VariantOptions): void {
  const dir = join(FIXTURES, opts.name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const iop = opts.iop ?? [1, 0, 0, 0, 1, 0];
  const ippFor = opts.ippFor ?? ((k: number) => [0, 0, k * Z_SP]);
  const ts = opts.transferSyntax ?? '1.2.840.10008.1.2.1';
  const echoes = opts.echoes ?? [undefined as unknown as number];
  const ks = Array.from({ length: NZ }, (_, k) => k).filter(
    (k) => !(opts.skipSlices ?? []).includes(k),
  );
  const names = shuffled(ks.length * echoes.length);
  let fileIdx = 0;
  for (const echo of echoes) {
    const seriesUID = `${UID_ROOT}.2.${nameHash(opts.name)}`;
    for (const k of ks) {
      const base = sliceValues(k);
      let pixels: Uint16Array | Int16Array = base;
      if (opts.transform || echo === 2) {
        const t = opts.transform ?? ((v: number) => v);
        const echoScale = echo === 2 ? 1.5 : 1;
        if (opts.pixelRepresentation === 1) {
          const signed = new Int16Array(base.length);
          for (let i = 0; i < base.length; i++) signed[i] = t(base[i]! * echoScale);
          pixels = signed;
        } else {
          const u = new Uint16Array(base.length);
          for (let i = 0; i < base.length; i++) u[i] = t(base[i]! * echoScale);
          pixels = u;
        }
      }
      writeSliceFile(dir, `im_${String(names[fileIdx]).padStart(3, '0')}.dcm`, {
        k,
        pixels,
        iop,
        ipp: ippFor(k),
        transferSyntax: ts,
        photometric: opts.photometric ?? 'MONOCHROME2',
        bitsStored: opts.bitsStored ?? 16,
        highBit: (opts.bitsStored ?? 16) - 1,
        pixelRepresentation: opts.pixelRepresentation ?? 0,
        seriesUID,
        seriesDescription: opts.description,
        sopUID: `${UID_ROOT}.3.${nameHash(opts.name)}.${echo ?? 0}.${k}`,
        instanceNumber: NZ - k, // reversed on purpose — a trap for InstanceNumber sorting
        echoNumber: echo,
      });
      fileIdx++;
    }
  }
  console.log(`wrote ${fileIdx} files → fixtures/${opts.name}`);
}

function writeMultiframe(): void {
  const dir = join(FIXTURES, 'phantom-multiframe');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const { DicomDict, DicomMetaDictionary } = dcmjs.data;
  const all = new Uint16Array(NX * NY * NZ);
  for (let k = 0; k < NZ; k++) all.set(sliceValues(k), k * NX * NY);
  const dataset: Record<string, unknown> = {
    SOPClassUID: '1.2.840.10008.5.1.4.1.1.4.1',
    SOPInstanceUID: `${UID_ROOT}.4.1`,
    StudyInstanceUID: `${UID_ROOT}.1`,
    SeriesInstanceUID: `${UID_ROOT}.4.2`,
    Modality: 'MR',
    PatientName: 'PHANTOM^MRIVIEWER',
    PatientID: 'PHM001',
    StudyDate: '20260703',
    SeriesDescription: 'phantom enhanced multiframe',
    ImageType: 'ORIGINAL\\PRIMARY',
    NumberOfFrames: NZ,
    Rows: NY,
    Columns: NX,
    BitsAllocated: 16,
    BitsStored: 16,
    HighBit: 15,
    PixelRepresentation: 0,
    SamplesPerPixel: 1,
    PhotometricInterpretation: 'MONOCHROME2',
    SharedFunctionalGroupsSequence: [
      {
        PlaneOrientationSequence: [{ ImageOrientationPatient: [1, 0, 0, 0, 1, 0] }],
        PixelMeasuresSequence: [{ PixelSpacing: [ROW_SP, COL_SP], SliceThickness: 2.0 }],
        PixelValueTransformationSequence: [{ RescaleSlope: 1, RescaleIntercept: 0 }],
      },
    ],
    PerFrameFunctionalGroupsSequence: Array.from({ length: NZ }, (_, k) => ({
      // Frames deliberately stored in REVERSE spatial order — sort must fix it.
      PlanePositionSequence: [{ ImagePositionPatient: [0, 0, (NZ - 1 - k) * Z_SP] }],
    })),
    PixelData: (() => {
      const reordered = new Uint16Array(NX * NY * NZ);
      for (let f = 0; f < NZ; f++) {
        reordered.set(all.subarray((NZ - 1 - f) * NX * NY, (NZ - f) * NX * NY), f * NX * NY);
      }
      return reordered.buffer;
    })(),
    _vrMap: { PixelData: 'OW' },
  };
  const meta: Record<string, unknown> = {
    FileMetaInformationVersion: new Uint8Array([0, 1]).buffer,
    MediaStorageSOPClassUID: dataset.SOPClassUID,
    MediaStorageSOPInstanceUID: dataset.SOPInstanceUID,
    TransferSyntaxUID: '1.2.840.10008.1.2.1',
    ImplementationClassUID: `${UID_ROOT}.99`,
    ImplementationVersionName: 'MRIVIEWER',
  };
  const dict = new DicomDict(DicomMetaDictionary.denaturalizeDataset(meta));
  dict.dict = DicomMetaDictionary.denaturalizeDataset(dataset);
  writeFileSync(join(dir, 'enhanced.dcm'), Buffer.from(dict.write()));
  console.log('wrote 1 file → fixtures/phantom-multiframe');
}

mkdirSync(FIXTURES, { recursive: true });
writeVariant({ name: 'phantom-axial', description: 'phantom axial explicit' });
writeVariant({
  name: 'phantom-implicit',
  description: 'phantom axial implicit',
  transferSyntax: '1.2.840.10008.1.2',
});
writeVariant({
  name: 'phantom-oblique',
  description: 'phantom oblique 30deg',
  iop: [1, 0, 0, 0, Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)],
  ippFor: (k) => [0, -Math.sin(Math.PI / 6) * Z_SP * k, Math.cos(Math.PI / 6) * Z_SP * k],
});
writeVariant({
  name: 'phantom-missing-slice',
  description: 'phantom with dropped slice',
  skipSlices: [10],
});
writeVariant({
  name: 'phantom-dual-echo',
  description: 'phantom dual echo',
  echoes: [1, 2],
});
writeVariant({
  name: 'phantom-mono1',
  description: 'phantom MONOCHROME1',
  photometric: 'MONOCHROME1',
  transform: (v) => 4095 - v,
});
writeVariant({
  name: 'phantom-signed',
  description: 'phantom signed 12-in-16',
  bitsStored: 12,
  pixelRepresentation: 1,
  transform: (v) => Math.round(v / 2) - 200, // range −200..1300, fits 12-bit signed
});
writeMultiframe();
console.log('phantom generation complete');
