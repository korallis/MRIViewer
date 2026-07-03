// Ambient stub for the OPTIONAL @cornerstonejs/dicom-codec dependency. The
// package is not installed in this build; the codec registry imports it
// dynamically and degrades gracefully when absent (see workers/codecs/registry.ts).
declare module '@cornerstonejs/dicom-codec' {
  export function decode(
    bytes: Uint8Array,
    info: {
      rows: number;
      columns: number;
      bitsAllocated: number;
      signed: boolean;
      samplesPerPixel: number;
    },
    transferSyntaxUID: string,
  ): Promise<{ pixelData: Uint8Array | Int16Array | Uint16Array }>;
}
