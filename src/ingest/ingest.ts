import { getPool } from '../workers/pool';
import { groupIntoCandidates } from '../dicom/series';
import { assembleVolume } from '../dicom/assemble';
import { canDecode } from '../workers/codecs/registry';
import type { ParsedSlice, SliceMeta, VolumeCandidate } from '../dicom/types';
import { useViewer, type CandidateSummary } from '../state/store';
import * as resources from '../state/resources';
import type { FoundFile } from './traverse';

/** Any newer operation (drop or series load) invalidates in-flight work. */
let generation = 0;

export function max3DTextureSize(): number {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return 2048;
    return gl.getParameter(gl.MAX_3D_TEXTURE_SIZE) as number;
  } catch {
    return 2048;
  }
}

function summarize(c: VolumeCandidate): CandidateSummary {
  const first = c.slices[0]!;
  const multiframe = first.numberOfFrames > 1;
  const unsupported = !canDecode(first.transferSyntaxUID) ? first.transferSyntaxUID : null;
  return {
    key: c.key,
    description: c.description,
    sliceCount: c.slices.length,
    dims: `${first.columns}×${first.rows}×${c.slices.length}`,
    reconstructable: c.reconstructable && !unsupported,
    warnings: c.warnings,
    errors: unsupported ? [...c.errors, `Unsupported encoding: ${unsupported}`] : c.errors,
    thumbnail: null,
    lossySource: first.lossySource,
    unsupportedSyntax: unsupported,
    multiframe,
  };
}

function thumbnailFrom(meta: SliceMeta, pixels: ParsedSlice['pixels']): string {
  const SIZE = 96;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(SIZE, SIZE);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < pixels.length; i++) {
    const v = pixels[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  const invert = meta.photometricInterpretation === 'MONOCHROME1';
  for (let y = 0; y < SIZE; y++) {
    const sy = Math.floor((y / SIZE) * meta.rows);
    for (let x = 0; x < SIZE; x++) {
      const sx = Math.floor((x / SIZE) * meta.columns);
      let g = (pixels[sy * meta.columns + sx]! - min) / range;
      if (invert) g = 1 - g;
      const o = (y * SIZE + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.round(g * 255);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

export async function ingestFiles(found: FoundFile[]): Promise<void> {
  const gen = ++generation;
  const pool = getPool();
  pool.clearQueue();
  const { set, pushError } = useViewer.getState();
  resources.clearVolume();
  set({
    stage: 'ingesting',
    candidates: [],
    selectedKey: null,
    report: null,
    progress: { done: 0, total: found.length, label: 'Scanning files' },
    announce: `Scanning ${found.length} files`,
  });

  const metas: SliceMeta[] = [];
  const files = new Map<string, File>();
  const unreadable: string[] = [];
  let skipped = 0;
  let done = 0;

  await Promise.all(
    found.map((f) =>
      pool.parseMeta(f.file).then((r) => {
        if (gen !== generation) return;
        done++;
        if (done % 16 === 0 || done === found.length) {
          set({ progress: { done, total: found.length, label: 'Scanning files' } });
        }
        if (r.ok) {
          metas.push(r.meta);
          files.set(r.meta.sopInstanceUID, f.file);
        } else if (r.reason === 'not-dicom') {
          skipped++;
        } else {
          unreadable.push(`${r.fileName}: ${r.detail ?? 'parse error'}`);
        }
      }),
    ),
  );
  if (gen !== generation) return;

  const report = {
    totalFiles: found.length,
    dicomFiles: metas.length,
    skippedNonDicom: skipped,
    unreadable,
  };
  if (metas.length === 0) {
    set({ stage: 'idle', report });
    pushError('No DICOM files found in that folder. Files are identified by content, not extension.');
    return;
  }

  const candidates = groupIntoCandidates(metas, max3DTextureSize());
  resources.setCandidates(candidates, files);
  set({ stage: 'browsing', candidates: candidates.map(summarize), report, announce: `Found ${candidates.length} series` });

  // Thumbnails: decode one middle slice per browsable series, off the main thread.
  for (const c of candidates) {
    if (c.slices[0]!.numberOfFrames > 1 || !canDecode(c.slices[0]!.transferSyntaxUID)) continue;
    const mid = c.sorted ? c.slices[c.sorted.order[Math.floor(c.slices.length / 2)]!]! : c.slices[0]!;
    const file = files.get(mid.sopInstanceUID);
    if (!file) continue;
    pool
      .parsePixels(file)
      .then((r) => {
        if (gen !== generation || !r.ok) return;
        const thumbnail = thumbnailFrom(r.meta, r.pixels);
        const state = useViewer.getState();
        state.set({
          candidates: state.candidates.map((s) => (s.key === c.key ? { ...s, thumbnail } : s)),
        });
      })
      .catch(() => undefined);
  }
}

export async function loadSeries(key: string): Promise<void> {
  const gen = ++generation;
  const pool = getPool();
  pool.clearQueue();
  const { set, pushError } = useViewer.getState();
  const candidate = resources.getCandidate(key);
  if (!candidate) return;
  const total = candidate.slices.length;
  set({
    stage: 'loading',
    selectedKey: key,
    progress: { done: 0, total, label: 'Decoding pixel data' },
    announce: `Loading ${candidate.description}`,
  });

  const parsed = new Map<string, ParsedSlice>();
  const failures: string[] = [];
  let done = 0;
  await Promise.all(
    candidate.slices.map((m) => {
      const file = resources.getFile(m.sopInstanceUID);
      if (!file) {
        failures.push(`${m.fileName}: file handle lost`);
        return Promise.resolve();
      }
      return pool
        .parsePixels(file)
        .then((r) => {
          if (gen !== generation) return;
          done++;
          if (done % 8 === 0 || done === total) {
            set({ progress: { done, total, label: 'Decoding pixel data' } });
          }
          if (r.ok) parsed.set(r.meta.sopInstanceUID, { meta: r.meta, pixels: r.pixels });
          else failures.push(`${r.fileName}: ${r.detail ?? r.reason}`);
        });
    }),
  );
  if (gen !== generation) return;

  if (failures.length > 0) {
    set({ stage: 'browsing' });
    pushError(`Could not decode ${failures.length} file(s): ${failures[0]}`);
    return;
  }

  try {
    set({ progress: { done: total, total, label: 'Assembling volume' } });
    const volume = assembleVolume(candidate, parsed);
    parsed.clear(); // release per-slice buffers — the volume owns its own memory now
    resources.setVolume(key, volume);
    const s = useViewer.getState();
    set({
      stage: 'viewing',
      volumeVersion: s.volumeVersion + 1,
      windowClim: volume.window,
      crosshairTex: [0.5, 0.5, 0.5],
      clipMin: [0, 0, 0],
      clipMax: [1, 1, 1],
      invert: false,
      announce: `Viewing ${candidate.description}`,
    });
  } catch (err) {
    set({ stage: 'browsing' });
    pushError(err instanceof Error ? err.message : String(err));
  }
}
