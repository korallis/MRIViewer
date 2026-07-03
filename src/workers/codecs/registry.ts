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
    (WASM_SYNTAXES.has(ts) && wasmCodecAvailable())
  );
}

// The WASM codec package (@cornerstonejs/dicom-codec) is an OPTIONAL dependency.
// This build does not vendor it, so JPEG-family syntaxes report as unsupported
// (honest) rather than failing only at load time. To enable: install the package,
// co-locate its WASM (see docs/CODECS.md), and set wasmProbe via initCodecs().
let wasmProbe: 'unknown' | 'available' | 'absent' = 'unknown';
function wasmCodecAvailable(): boolean {
  return wasmProbe === 'available';
}

/** Probe the optional WASM codec once at worker startup. */
export async function initCodecs(): Promise<void> {
  if (wasmProbe !== 'unknown') return;
  const mod = await loadWasmCodec();
  wasmProbe = mod ? 'available' : 'absent';
}

interface DicomCodecModule {
  decode: (
    bytes: Uint8Array,
    info: { rows: number; columns: number; bitsAllocated: number; signed: boolean; samplesPerPixel: number },
    ts: string,
  ) => Promise<{ pixelData: Uint8Array | Int16Array | Uint16Array }>;
}
let codecModule: DicomCodecModule | null = null;
async function loadWasmCodec(): Promise<DicomCodecModule | null> {
  if (codecModule) return codecModule;
  try {
    // Optional dependency. The specifier is assembled at runtime so Vite's
    // import-analysis does not try to resolve a package that isn't installed
    // (a static string errors the dev server even with @vite-ignore).
    const pkg = ['@cornerstonejs', 'dicom-codec'].join('/');
    const mod = (await import(/* @vite-ignore */ pkg)) as unknown as DicomCodecModule;
    codecModule = mod;
    wasmProbe = 'available';
    return mod;
  } catch {
    wasmProbe = 'absent';
    return null;
  }
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
  // Empty Basic Offset Table → assume one fragment per frame (true for our RLE
  // and typical single-frame encapsulated series).
  const encoded = (
    bot && bot.length > 0
      ? dicomParserMod.readEncapsulatedImageFrame(ds, pixelDataElement, frameIndex)
      : dicomParserMod.readEncapsulatedPixelDataFromFragments(ds, pixelDataElement, frameIndex)
  ) as Uint8Array;

  if (meta.transferSyntaxUID === TransferSyntax.RLELossless) {
    const raw = decodeRLE(encoded, meta.rows, meta.columns, meta.bitsAllocated);
    return reinterpret(raw, meta);
  }

  if (WASM_SYNTAXES.has(meta.transferSyntaxUID)) {
    const mod = await loadWasmCodec();
    if (!mod) throw new UnsupportedTransferSyntaxError(meta.transferSyntaxUID);
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
    const pd = result.pixelData;
    if (pd instanceof Uint8Array) return reinterpret(pd, meta);
    return pd;
  }

  throw new UnsupportedTransferSyntaxError(meta.transferSyntaxUID);
}
