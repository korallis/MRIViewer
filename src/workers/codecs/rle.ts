/**
 * DICOM RLE Lossless decode (1.2.840.10008.1.2.5) — pure JS, no WASM.
 * Frame layout: 64-byte header (uint32 segment count + 15 uint32 offsets),
 * then PackBits-compressed byte segments. For 16-bit data there are 2 segments
 * ordered most-significant-byte plane first (DICOM PS3.5 Annex G).
 */
export function decodeRLE(
  data: Uint8Array,
  rows: number,
  columns: number,
  bitsAllocated: number,
): Uint8Array {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const numSegments = view.getUint32(0, true);
  const offsets: number[] = [];
  for (let i = 0; i < numSegments; i++) offsets.push(view.getUint32(4 + i * 4, true));

  const pixelCount = rows * columns;
  const bytesPerSample = bitsAllocated / 8;
  const out = new Uint8Array(pixelCount * bytesPerSample);

  for (let s = 0; s < numSegments; s++) {
    const start = offsets[s]!;
    const end = s + 1 < numSegments ? offsets[s + 1]! : data.length;
    const plane = unpackBits(data.subarray(start, end), pixelCount);
    // Segment s holds byte (bytesPerSample-1-s) of each sample (MSB first).
    const byteIndex = bytesPerSample - 1 - s;
    for (let p = 0; p < pixelCount; p++) {
      out[p * bytesPerSample + byteIndex] = plane[p]!;
    }
  }
  return out;
}

/** PackBits (Apple) decompression to exactly `expected` bytes. */
function unpackBits(src: Uint8Array, expected: number): Uint8Array {
  const out = new Uint8Array(expected);
  let o = 0;
  let i = 0;
  while (i < src.length && o < expected) {
    const n = src[i++]!;
    if (n < 128) {
      const count = n + 1;
      for (let c = 0; c < count && o < expected; c++) out[o++] = src[i++]!;
    } else if (n > 128) {
      const count = 257 - n;
      const b = src[i++]!;
      for (let c = 0; c < count && o < expected; c++) out[o++] = b;
    }
    // n === 128 is a no-op.
  }
  return out;
}

/** PackBits compression of one byte plane. */
export function packBits(src: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < src.length) {
    // Count a run of identical bytes.
    let runLen = 1;
    while (i + runLen < src.length && src[i + runLen] === src[i] && runLen < 128) runLen++;
    if (runLen >= 2) {
      out.push(257 - runLen, src[i]!);
      i += runLen;
    } else {
      // Literal run until the next run-of-2 or 128 bytes.
      const litStart = i;
      let litLen = 0;
      while (i < src.length && litLen < 128) {
        const isRun = i + 1 < src.length && src[i + 1] === src[i];
        if (isRun) break;
        i++;
        litLen++;
      }
      out.push(litLen - 1);
      for (let k = 0; k < litLen; k++) out.push(src[litStart + k]!);
    }
  }
  return new Uint8Array(out);
}

/** Encode one frame as a DICOM RLE fragment (used by the phantom generator). */
export function encodeRLEFrame(pixels: Uint16Array | Uint8Array, bytesPerSample: number): Uint8Array {
  const pixelCount = pixels.length;
  const segments: Uint8Array[] = [];
  for (let b = bytesPerSample - 1; b >= 0; b--) {
    const plane = new Uint8Array(pixelCount);
    for (let p = 0; p < pixelCount; p++) plane[p] = (pixels[p]! >> (b * 8)) & 0xff;
    segments.push(packBits(plane));
  }
  const header = new ArrayBuffer(64);
  const hv = new DataView(header);
  hv.setUint32(0, segments.length, true);
  let offset = 64;
  segments.forEach((seg, idx) => {
    hv.setUint32(4 + idx * 4, offset, true);
    offset += seg.length;
  });
  const total = offset % 2 === 0 ? offset : offset + 1; // even-length fragment
  const frame = new Uint8Array(total);
  frame.set(new Uint8Array(header), 0);
  let pos = 64;
  for (const seg of segments) {
    frame.set(seg, pos);
    pos += seg.length;
  }
  return frame;
}
