/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import { extractMeta, isDicom, parseDataSet, parseSlice, UnsupportedTransferSyntaxError } from '../dicom/parse';
import type { SliceMeta } from '../dicom/types';
import { decodeFrame, canDecode } from './codecs/registry';

export type MetaResult =
  | { ok: true; meta: SliceMeta }
  | { ok: false; fileName: string; reason: 'not-dicom' | 'error'; detail?: string };

export type PixelResult =
  | { ok: true; meta: SliceMeta; pixels: Int16Array | Uint16Array | Uint8Array }
  | { ok: false; fileName: string; reason: 'unsupported-ts' | 'error'; detail?: string };

const api = {
  /** Pass 1: metadata only — cheap, lets the UI browse before any pixel decode. */
  async parseMeta(file: File): Promise<MetaResult> {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!isDicom(bytes)) return { ok: false, fileName: file.name, reason: 'not-dicom' };
      const ds = parseDataSet(bytes);
      return { ok: true, meta: extractMeta(ds, file.name) };
    } catch (err) {
      return {
        ok: false,
        fileName: file.name,
        reason: 'error',
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  },

  /** Pass 2: decode pixels for one file (on series selection). Zero-copy transfer out. */
  async parsePixels(file: File): Promise<PixelResult> {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { meta, pixels } = await parseSlice(bytes, file.name, { decodeFrame });
      return Comlink.transfer({ ok: true as const, meta, pixels }, [pixels.buffer]);
    } catch (err) {
      if (err instanceof UnsupportedTransferSyntaxError) {
        return {
          ok: false,
          fileName: file.name,
          reason: 'unsupported-ts',
          detail: err.transferSyntaxUID,
        };
      }
      return {
        ok: false,
        fileName: file.name,
        reason: 'error',
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  },

  canDecode(ts: string): boolean {
    return canDecode(ts);
  },
};

export type IngestWorkerApi = typeof api;
Comlink.expose(api);
