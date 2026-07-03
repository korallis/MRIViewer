import * as Comlink from 'comlink';
import type { IngestWorkerApi, MetaResult, PixelResult } from './ingest.worker';
import type { SliceMeta } from '../dicom/types';

export type MultiframeResult =
  | { ok: true; frames: Array<{ meta: SliceMeta; pixels: Int16Array | Uint16Array | Uint8Array }> }
  | { ok: false; fileName: string; reason: 'error'; detail?: string };

interface Slot {
  api: Comlink.Remote<IngestWorkerApi>;
  worker: Worker;
  busy: boolean;
}

/**
 * Worker pool sized to ~half the cores (Cornerstone3D's production default).
 * One in-flight job per worker; excess jobs queue. clearQueue() supports
 * cancellation when a new folder is dropped mid-ingest.
 */
export class IngestPool {
  private slots: Slot[] = [];
  private queue: Array<(slot: Slot) => void> = [];

  constructor(size = Math.max(1, Math.floor((navigator.hardwareConcurrency || 4) / 2))) {
    for (let i = 0; i < size; i++) {
      const worker = new Worker(new URL('./ingest.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.slots.push({ api: Comlink.wrap<IngestWorkerApi>(worker), worker, busy: false });
    }
  }

  private acquire(): Promise<Slot> {
    const free = this.slots.find((s) => !s.busy);
    if (free) {
      free.busy = true;
      return Promise.resolve(free);
    }
    return new Promise((resolve) => this.queue.push((slot) => resolve(slot)));
  }

  private release(slot: Slot): void {
    const next = this.queue.shift();
    if (next) {
      next(slot);
    } else {
      slot.busy = false;
    }
  }

  async run<R>(job: (api: Comlink.Remote<IngestWorkerApi>) => Promise<R>): Promise<R> {
    const slot = await this.acquire();
    try {
      return await job(slot.api);
    } finally {
      this.release(slot);
    }
  }

  // Typed conveniences — comlink's Remote<> mapping degrades our discriminated
  // unions to unknown, so the cast is centralized here.
  parseMeta(file: File): Promise<MetaResult> {
    return this.run((api) => api.parseMeta(file) as unknown as Promise<MetaResult>);
  }

  parsePixels(file: File): Promise<PixelResult> {
    return this.run((api) => api.parsePixels(file) as unknown as Promise<PixelResult>);
  }

  parseMultiframe(file: File): Promise<MultiframeResult> {
    return this.run((api) => api.parseMultiframe(file) as unknown as Promise<MultiframeResult>);
  }

  clearQueue(): void {
    this.queue.length = 0;
  }

  terminate(): void {
    this.clearQueue();
    for (const s of this.slots) s.worker.terminate();
    this.slots = [];
  }
}

let shared: IngestPool | null = null;
export function getPool(): IngestPool {
  if (!shared) shared = new IngestPool();
  return shared;
}
