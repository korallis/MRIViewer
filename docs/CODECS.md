# Transfer syntax support

MRIViewer decodes DICOM pixel data entirely in the browser, in Web Workers, with
**zero network calls**. Support by transfer syntax:

| Transfer syntax | UID | Status | Mechanism |
|---|---|---|---|
| Implicit VR Little Endian | `1.2.840.10008.1.2` | ✅ | native |
| Explicit VR Little Endian | `1.2.840.10008.1.2.1` | ✅ | native |
| Deflated Explicit VR LE | `1.2.840.10008.1.2.1.99` | ✅ | pako inflate |
| RLE Lossless | `1.2.840.10008.1.2.5` | ✅ | pure-JS (`src/workers/codecs/rle.ts`) |
| Enhanced (multi-frame) MR | SOP `…1.1.4.1` | ✅ | dcmjs functional-group expansion |
| JPEG Baseline / Extended | `.4.50` / `.4.51` | ✅ | `@cornerstonejs/dicom-codec` |
| JPEG Lossless / SV1 | `.4.57` / `.4.70` | ✅ | `@cornerstonejs/dicom-codec` |
| JPEG-LS | `.4.80` / `.4.81` | ✅ | `@cornerstonejs/dicom-codec` (CharLS) |
| JPEG 2000 | `.4.90` / `.4.91` | ✅ | `@cornerstonejs/dicom-codec` (OpenJPEG) |
| HTJ2K | `.4.201` / `.4.202` / `.4.203` | ✅ | `@cornerstonejs/dicom-codec` (OpenJPH) |

`✅` decode paths are covered by unit tests against synthetic fixtures.

## JPEG-family codecs

JPEG/JPEG2000/JPEG-LS/HTJ2K decoders are loaded lazily from
`@cornerstonejs/dicom-codec` the first time a compressed file is decoded. The
package is a normal dependency so real-world JPEG 2000 spine MRI discs are
selectable in the series browser instead of being marked unsupported.

> ⚠️ HTJ2K UIDs are `1.2.840.10008.1.2.4.201/.202/.203`. The upstream
> `@cornerstonejs/dicom-codec` README lists a typo'd `1.2.840.10008.1.2.202`;
> MRIViewer keys decoder dispatch on the canonical `.4.20x` forms.
