import type dicomParser from 'dicom-parser';
import type { SliceMeta } from '../../dicom/types';
import { isDeflated, isUncompressed } from '../../dicom/uids';

/**
 * Compressed transfer-syntax decoder registry. Phase 5 wires WASM codecs
 * (charls / openjpeg / libjpeg-turbo / RLE) behind this interface; until a
 * codec is registered, compressed files surface as 'unsupported-ts'.
 */
export function canDecode(ts: string): boolean {
  return isUncompressed(ts) || isDeflated(ts);
}

export async function decodeFrame(
  _ds: dicomParser.DataSet,
  meta: SliceMeta,
  _frameIndex: number,
): Promise<Int16Array | Uint16Array | Uint8Array> {
  const { UnsupportedTransferSyntaxError } = await import('../../dicom/parse');
  throw new UnsupportedTransferSyntaxError(meta.transferSyntaxUID);
}
