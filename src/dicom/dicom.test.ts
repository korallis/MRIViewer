import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDicom, parseSlice } from './parse';
import { groupIntoCandidates } from './series';
import { assembleVolume } from './assemble';
import { applyMat4, invertAffine, lpsToRas } from './affine';
import { robustRange } from './intensity';
import type { AssembledVolume, ParsedSlice } from './types';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');

// Phantom ground truth — must match tools/make-phantom.ts.
const NX = 64;
const NY = 64;
const NZ = 24;
const Z_SP = 2.5;
const MARKER_CENTER = { i: 48, j: 16, k: 18 };
const MAX_VALUE = 3000;

async function loadDir(name: string): Promise<ParsedSlice[]> {
  const dir = join(FIXTURES, name);
  const out: ParsedSlice[] = [];
  for (const f of readdirSync(dir)) {
    const bytes = new Uint8Array(readFileSync(join(dir, f)));
    if (!isDicom(bytes)) continue;
    out.push(await parseSlice(bytes, f));
  }
  return out;
}

async function assembleDir(name: string): Promise<AssembledVolume[]> {
  const parsed = await loadDir(name);
  const byUID = new Map(parsed.map((p) => [p.meta.sopInstanceUID, p]));
  const candidates = groupIntoCandidates(parsed.map((p) => p.meta));
  return candidates.filter((c) => c.reconstructable).map((c) => assembleVolume(c, byUID));
}

function voxel(v: AssembledVolume, i: number, j: number, k: number): number {
  return v.data[k * v.dims[0] * v.dims[1] + j * v.dims[0] + i]!;
}

describe('parse', () => {
  it('round-trips the explicit VR phantom', async () => {
    const parsed = await loadDir('phantom-axial');
    expect(parsed).toHaveLength(NZ);
    const m = parsed[0]!.meta;
    expect(m.rows).toBe(NY);
    expect(m.columns).toBe(NX);
    expect(m.modality).toBe('MR');
    expect(m.pixelSpacing).toEqual([1, 1]);
    expect(m.transferSyntaxUID).toBe('1.2.840.10008.1.2.1');
    expect(m.patientName).toContain('PHANTOM');
  });

  it('parses implicit VR identically to explicit VR', async () => {
    const [explicit] = await assembleDir('phantom-axial');
    const [implicit] = await assembleDir('phantom-implicit');
    expect(implicit!.dims).toEqual(explicit!.dims);
    for (let n = 0; n < explicit!.data.length; n += 997) {
      expect(implicit!.data[n]).toBeCloseTo(explicit!.data[n]!, 6);
    }
  });

  it('rejects non-DICOM bytes', () => {
    expect(isDicom(new Uint8Array(200))).toBe(false);
    expect(isDicom(new TextEncoder().encode('hello world'.repeat(20)))).toBe(false);
  });
});

describe('geometric sort & spacing', () => {
  it('computes z-spacing from IPP deltas, not SliceThickness', async () => {
    const parsed = await loadDir('phantom-axial');
    const candidates = groupIntoCandidates(parsed.map((p) => p.meta));
    expect(candidates).toHaveLength(1);
    const sorted = candidates[0]!.sorted!;
    expect(sorted.zSpacing).toBeCloseTo(Z_SP, 6); // SliceThickness is 2.0 — a trap
    expect(sorted.normal[2]).toBeCloseTo(1, 6);
  });

  it('defeats the reversed-InstanceNumber trap (geometric order wins)', async () => {
    const [vol] = await assembleDir('phantom-axial');
    // Background at (0,0,k) = 4k → must increase with k. InstanceNumber sorting would reverse it.
    const v0 = voxel(vol!, 0, 0, 2);
    const v1 = voxel(vol!, 0, 0, 20);
    expect(v1).toBeGreaterThan(v0);
    expect(voxel(vol!, 0, 0, 10) * MAX_VALUE).toBeCloseTo(40, 0);
  });

  it('is invariant under input order shuffling', async () => {
    const parsed = await loadDir('phantom-axial');
    const byUID = new Map(parsed.map((p) => [p.meta.sopInstanceUID, p]));
    const a = assembleVolume(groupIntoCandidates(parsed.map((p) => p.meta))[0]!, byUID);
    const reversed = [...parsed].reverse();
    const b = assembleVolume(groupIntoCandidates(reversed.map((p) => p.meta))[0]!, byUID);
    for (let n = 0; n < a.data.length; n += 501) {
      expect(b.data[n]).toBe(a.data[n]);
    }
  });

  it('flags integer-multiple gaps as missing slices but stays reconstructable', async () => {
    const parsed = await loadDir('phantom-missing-slice');
    const c = groupIntoCandidates(parsed.map((p) => p.meta))[0]!;
    expect(c.sorted!.missingSlices).toBe(true);
    expect(c.sorted!.zSpacing).toBeCloseTo(Z_SP, 6);
    expect(c.reconstructable).toBe(true);
    expect(c.warnings.join(' ')).toMatch(/missing/i);
  });

  it('handles oblique acquisitions', async () => {
    const parsed = await loadDir('phantom-oblique');
    const c = groupIntoCandidates(parsed.map((p) => p.meta))[0]!;
    expect(c.reconstructable).toBe(true);
    expect(c.sorted!.zSpacing).toBeCloseTo(Z_SP, 5);
    expect(c.sorted!.normal[1]).toBeCloseTo(-0.5, 4);
    expect(c.sorted!.normal[2]).toBeCloseTo(Math.cos(Math.PI / 6), 4);
    expect(c.sorted!.shearWarning).toBe(false);
  });
});

describe('series splitting', () => {
  it('splits dual-echo series at identical positions into two candidates', async () => {
    const parsed = await loadDir('phantom-dual-echo');
    const candidates = groupIntoCandidates(parsed.map((p) => p.meta));
    expect(candidates).toHaveLength(2);
    for (const c of candidates) {
      expect(c.slices).toHaveLength(NZ);
      expect(c.reconstructable).toBe(true);
      expect(c.splitLabel).toMatch(/^echo/);
    }
  });
});

describe('intensity pipeline', () => {
  it('normalizes the marker to the top of the range', async () => {
    const [vol] = await assembleDir('phantom-axial');
    const m = voxel(vol!, MARKER_CENTER.i, MARKER_CENTER.j, MARKER_CENTER.k);
    expect(m).toBeCloseTo(1, 5);
    expect(voxel(vol!, 10, 10, 0) * MAX_VALUE).toBeCloseTo(30, 0);
    expect(vol!.window[0]).toBeGreaterThanOrEqual(0);
    expect(vol!.window[1]).toBeLessThanOrEqual(1);
    expect(vol!.window[0]).toBeLessThan(vol!.window[1]);
  });

  it('MONOCHROME1 inversion yields the same normalized volume', async () => {
    const [axial] = await assembleDir('phantom-axial');
    const [mono1] = await assembleDir('phantom-mono1');
    for (let n = 0; n < axial!.data.length; n += 733) {
      expect(mono1!.data[n]).toBeCloseTo(axial!.data[n]!, 4);
    }
  });

  it('signed 12-in-16 data normalizes to the same volume', async () => {
    const [axial] = await assembleDir('phantom-axial');
    const [signed] = await assembleDir('phantom-signed');
    for (let n = 0; n < axial!.data.length; n += 733) {
      expect(signed!.data[n]).toBeCloseTo(axial!.data[n]!, 2);
    }
  });

  it('robustRange clips outliers', () => {
    const data = new Float32Array(10000).fill(100);
    data[0] = 0;
    data[1] = 10000;
    const [lo, hi] = robustRange(data, 0, 10000);
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThan(10000);
  });
});

describe('affine (PLAN §6 — anti-mirroring)', () => {
  it('maps voxel indices to LPS mm exactly for the axial phantom', async () => {
    const [vol] = await assembleDir('phantom-axial');
    const m = vol!.lpsFromVoxel;
    expect(applyMat4(m, [0, 0, 0])).toEqual([0, 0, 0]); // IPP of first sorted slice
    const px = applyMat4(m, [1, 0, 0]);
    expect(px[0]).toBeCloseTo(1, 6); // +i → +X (patient Left), colSpacing 1mm
    const py = applyMat4(m, [0, 1, 0]);
    expect(py[1]).toBeCloseTo(1, 6); // +j → +Y (patient Posterior), rowSpacing 1mm
    const pz = applyMat4(m, [0, 0, 1]);
    expect(pz[2]).toBeCloseTo(Z_SP, 6); // +k → +Z (Superior), 2.5mm
  });

  it('places the marker in the patient Left-Anterior-Superior octant', async () => {
    const [vol] = await assembleDir('phantom-axial');
    const centerLps = applyMat4(vol!.lpsFromVoxel, [NX / 2, NY / 2, NZ / 2]);
    const markerLps = applyMat4(vol!.lpsFromVoxel, [
      MARKER_CENTER.i,
      MARKER_CENTER.j,
      MARKER_CENTER.k,
    ]);
    expect(markerLps[0]).toBeGreaterThan(centerLps[0]); // +X = Left ✓
    expect(markerLps[1]).toBeLessThan(centerLps[1]); // −Y = Anterior ✓
    expect(markerLps[2]).toBeGreaterThan(centerLps[2]); // +Z = Superior ✓
    // And in RAS world: Left → negative X, Anterior → positive Y.
    const ras = lpsToRas(markerLps);
    const rasCenter = lpsToRas(centerLps);
    expect(ras[0]).toBeLessThan(rasCenter[0]);
    expect(ras[1]).toBeGreaterThan(rasCenter[1]);
  });

  it('invertAffine round-trips', async () => {
    const [vol] = await assembleDir('phantom-oblique');
    const inv = invertAffine(vol!.lpsFromVoxel);
    const p = applyMat4(vol!.lpsFromVoxel, [10, 20, 5]);
    const back = applyMat4(inv, p);
    expect(back[0]).toBeCloseTo(10, 4);
    expect(back[1]).toBeCloseTo(20, 4);
    expect(back[2]).toBeCloseTo(5, 4);
  });
});
