// Ambient types for @cornerstonejs/dicom-codec. The package currently ships
// CommonJS source without TypeScript declarations.
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
  ): Promise<{
    imageFrame: Uint8Array | Int16Array | Uint16Array;
    imageInfo: unknown;
  }>;

  export function getPixelData(
    imageFrame: Uint8Array | Int16Array | Uint16Array,
    imageInfo: unknown,
    transferSyntaxUID: string,
  ): Uint8Array | Int16Array | Uint16Array;
}
