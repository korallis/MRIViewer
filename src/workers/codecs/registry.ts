import type dicomParser from 'dicom-parser';
import type { SliceMeta } from '../../dicom/types';
import { isDeflated, isUncompressed, TransferSyntax } from '../../dicom/uids';
import { signExtend, maskUnsigned } from '../../dicom/intensity';
import { decodeRLE } from './rle';

/**
 * Compressed transfer-syntax decoder registry (PLAN §5.6, Phase 5).
 *
 * Native / deflated: handled by the parse layer directly.
 * RLE Lossless (.5): pure-JS decode here, no WASM.
 * JPEG family (.50/.51/.57/.70/.80/.81/.90/.91/.201-.203): decoded via
 *   @cornerstonejs/dicom-codec, lazy-loaded so its WASM only downloads when a
 *   compressed file is actually encountered. The WASM MUST be self-hosted for
 *   the zero-network guarantee (see docs/CODECS.md) — never fetched from a CDN.
 */

const WASM_SYNTAXES = new Set<string>([
  TransferSyntax.JPEGBaseline8Bit,
  TransferSyntax.JPEGExtended12Bit,
  TransferSyntax.JPEGLossless,
  TransferSyntax.JPEGLosslessSV1,
  TransferSyntax.JPEGLSLossless,
  TransferSyntax.JPEGLSNearLossless,
  TransferSyntax.JPEG2000Lossless,
  TransferSyntax.JPEG2000,
  TransferSyntax.HTJ2KLossless,
  TransferSyntax.HTJ2KLosslessRPCL,
  TransferSyntax.HTJ2K,
]);

export function canDecode(ts: string): boolean {
  return (
    isUncompressed(ts) ||
    isDeflated(ts) ||
    ts === TransferSyntax.RLELossless ||
    WASM_SYNTAXES.has(ts)
  );
}

/** Kept as a worker-startup hook; codecs are now bundled as a normal dependency. */
export async function initCodecs(): Promise<void> {
  await loadWasmCodec();
}

interface DicomCodecModule {
  decode: (
    bytes: Uint8Array,
    info: { rows: number; columns: number; bitsAllocated: number; signed: boolean; samplesPerPixel: number },
    ts: string,
  ) => Promise<{ imageFrame: Uint8Array | Int16Array | Uint16Array; imageInfo: unknown }>;
  getPixelData?: (
    imageFrame: Uint8Array | Int16Array | Uint16Array,
    imageInfo: unknown,
    transferSyntaxUID: string,
  ) => Uint8Array | Int16Array | Uint16Array;
}
let codecModule: DicomCodecModule | null = null;
function installWorkerWindowAlias(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  if (g.window || !g.self) return;
  // @cornerstonejs/dicom-codec's timer asks browser-or-node for `isBrowser`,
  // which requires window.document, then reads window.performance. Dedicated
  // workers expose performance on self but no window/document, so alias enough
  // of self before the lazy import for the timer to work.
  const workerGlobal = g.self as Record<string, unknown>;
  workerGlobal.document ??= {};
  g.window = workerGlobal;
}

async function loadWasmCodec(): Promise<DicomCodecModule> {
  if (codecModule) return codecModule;
  installWorkerWindowAlias();
  const mod = (await import('@cornerstonejs/dicom-codec')) as unknown as
    | DicomCodecModule
    | { default: DicomCodecModule };
  codecModule = 'default' in mod ? mod.default : mod;
  return codecModule;
}

function reinterpret(
  bytes: Uint8Array,
  meta: SliceMeta,
): Int16Array | Uint16Array | Uint8Array {
  if (meta.bitsAllocated === 8) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length).slice();
  const count = bytes.byteLength / 2;
  const raw = new Uint16Array(count);
  raw.set(new Uint16Array(bytes.buffer, bytes.byteOffset, count));
  return meta.pixelRepresentation === 1
    ? signExtend(raw, meta.bitsStored)
    : maskUnsigned(raw, meta.bitsStored, meta.highBit);
}

export async function decodeFrame(
  ds: dicomParser.DataSet,
  meta: SliceMeta,
  frameIndex: number,
): Promise<Int16Array | Uint16Array | Uint8Array> {
  const { UnsupportedTransferSyntaxError } = await import('../../dicom/parse');
  const dicomParserMod = (await import('dicom-parser')).default;
  const pixelDataElement = ds.elements.x7fe00010!;
  const bot = (pixelDataElement as { basicOffsetTable?: number[] }).basicOffsetTable;
  const fragments = (pixelDataElement as { fragments?: unknown[] }).fragments ?? [];
  // Empty Basic Offset Table: for classic single-frame compressed DICOM, all
  // fragments belong to the frame. This is safer than assuming one fragment.
  const encoded = (
    bot && bot.length > 0
      ? dicomParserMod.readEncapsulatedImageFrame(ds, pixelDataElement, frameIndex)
      : dicomParserMod.readEncapsulatedPixelDataFromFragments(ds, pixelDataElement, 0, fragments.length)
  ) as Uint8Array;

  if (meta.transferSyntaxUID === TransferSyntax.RLELossless) {
    const raw = decodeRLE(encoded, meta.rows, meta.columns, meta.bitsAllocated);
    return reinterpret(raw, meta);
  }

  if (WASM_SYNTAXES.has(meta.transferSyntaxUID)) {
    const mod = await loadWasmCodec();
    const result = await mod.decode(
      encoded,
      {
        rows: meta.rows,
        columns: meta.columns,
        bitsAllocated: meta.bitsAllocated,
        signed: meta.pixelRepresentation === 1,
        samplesPerPixel: meta.samplesPerPixel,
      },
      meta.transferSyntaxUID,
    );
    const pd = mod.getPixelData
      ? mod.getPixelData(result.imageFrame, result.imageInfo, meta.transferSyntaxUID)
      : result.imageFrame;
    if (pd instanceof Uint8Array) return reinterpret(pd, meta);
    return pd;
  }

  throw new UnsupportedTransferSyntaxError(meta.transferSyntaxUID);
}
