/**
 * Sign-extend two's-complement values stored in `bitsStored` bits (e.g. 12-in-16).
 * Wrong handling shows as salt-and-pepper wraparound in bright regions (PLAN §5.6).
 */
export function signExtend(raw: Uint16Array, bitsStored: number): Int16Array {
  const shift = 16 - bitsStored;
  const out = new Int16Array(raw.length);
  if (shift === 0) {
    out.set(new Int16Array(raw.buffer, raw.byteOffset, raw.length));
    return out;
  }
  for (let i = 0; i < raw.length; i++) {
    out[i] = (raw[i]! << shift) >> shift;
  }
  return out;
}

/** Mask bits above HighBit — ancient files stored overlay planes up there. */
export function maskUnsigned(raw: Uint16Array, bitsStored: number, highBit: number): Uint16Array {
  if (bitsStored >= 16 && highBit >= 15) return raw;
  const mask = (1 << (highBit + 1)) - 1;
  for (let i = 0; i < raw.length; i++) {
    raw[i] = raw[i]! & mask;
  }
  return raw;
}

/**
 * Robust intensity range via histogram percentile clip (3D-Slicer-style).
 * MR intensities are arbitrary units — never use fixed CT-style windows.
 */
export function robustRange(
  data: Float32Array,
  min: number,
  max: number,
  pLow = 0.005,
  pHigh = 0.995,
): [number, number] {
  if (max <= min) return [min, min + 1];
  const BINS = 1024;
  const hist = new Uint32Array(BINS);
  const scale = BINS / (max - min);
  for (let i = 0; i < data.length; i++) {
    let b = ((data[i]! - min) * scale) | 0;
    if (b >= BINS) b = BINS - 1;
    hist[b]!++;
  }
  const total = data.length;
  let lo = min;
  let hi = max;
  let acc = 0;
  for (let b = 0; b < BINS; b++) {
    acc += hist[b]!;
    if (acc >= total * pLow) {
      lo = min + (b / BINS) * (max - min);
      break;
    }
  }
  acc = 0;
  for (let b = BINS - 1; b >= 0; b--) {
    acc += hist[b]!;
    if (acc >= total * (1 - pHigh)) {
      hi = min + ((b + 1) / BINS) * (max - min);
      break;
    }
  }
  if (hi <= lo) return [min, max];
  return [lo, hi];
}
