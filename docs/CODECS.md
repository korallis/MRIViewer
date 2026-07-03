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
| JPEG Baseline / Extended | `.4.50` / `.4.51` | 🔌 scaffolded | `@cornerstonejs/dicom-codec` (WASM, optional) |
| JPEG Lossless / SV1 | `.4.57` / `.4.70` | 🔌 scaffolded | WASM |
| JPEG-LS | `.4.80` / `.4.81` | 🔌 scaffolded | WASM (CharLS) |
| JPEG 2000 | `.4.90` / `.4.91` | 🔌 scaffolded | WASM (OpenJPEG) |
| HTJ2K | `.4.201` / `.4.202` / `.4.203` | 🔌 scaffolded | WASM (OpenJPH) |

`✅` decode paths are covered by unit tests against synthetic fixtures.

## Enabling the JPEG-family WASM codecs

The JPEG/JPEG2000/JPEG-LS/HTJ2K decoders are wired behind a lazy dynamic import
in `src/workers/codecs/registry.ts` but the WASM package is an **optional
dependency** (not bundled by default). To enable:

```bash
npm install @cornerstonejs/dicom-codec
```

Then ensure its `.wasm` assets are **self-hosted** (copied into the build output),
never fetched from a CDN — the strict CSP (`connect-src 'self'`) and the CI
zero-network test will otherwise fail. Configure Vite `assetsInclude` / a copy
step for `node_modules/@cornerstonejs/dicom-codec/dist/*.wasm`, and the worker
will detect and activate them on startup via `initCodecs()`.

Until then, unsupported-encoding series are shown in the series browser with a
clear badge and are not selectable — no silent failure.

> ⚠️ HTJ2K UIDs are `1.2.840.10008.1.2.4.201/.202/.203`. The upstream
> `@cornerstonejs/dicom-codec` README lists a typo'd `1.2.840.10008.1.2.202`;
> MRIViewer keys decoder dispatch on the canonical `.4.20x` forms.
