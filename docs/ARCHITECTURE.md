# Architecture

MRIViewer is a local-only React + TypeScript + Vite app. A dropped DICOM folder
is parsed in a Web Worker pool, assembled into a normalized volume, and rendered
as a GPU raymarched 3D volume plus three linked MPR slice panes — all in one
WebGL2 context.

## Data flow

```
folder drop / picker
      │  File[] (structured-cloneable, lazy)
      ▼
Web Worker pool (comlink, ~cores/2)
  · DICM sniff · dicom-parser tags · RLE / codec decode · dcmjs multiframe
      │  pixel ArrayBuffers (transferred, zero-copy)
      ▼
volume assembly (main thread, off render loop)
  · group by Study→Series→orientation→4D
  · geometric sort  dot(n̂, IPP)
  · validate spacing / shear / texture limits
  · rescale → sign-extend → percentile-normalize [0,1]
      │  Float32 voxels + LPS affine  →  resource registry (NOT React state)
      ▼
R3F Canvas (frameloop=demand, flat+linear)
  · one R16F Data3DTexture, uploaded once
  · manual 4-viewport render: 3 MPR slice shaders + 1 raymarch shader
```

## Modules

| Path | Responsibility |
|---|---|
| `src/dicom/` | Pure TS, no DOM/three. parse, uids, intensity, sort, series, affine, assemble, multiframe. Unit-tested in Node. |
| `src/workers/` | `ingest.worker.ts` (comlink API), `pool.ts`, `codecs/` (RLE + lazy WASM registry). |
| `src/ingest/` | `traverse.ts` (folder traversal), `ingest.ts` (orchestration, cancellation). |
| `src/volume/` | `texture.ts` (R16F upload), `matrices.ts` (LPS→RAS), `orientation.ts` (labels). |
| `src/render/` | GLSL shaders (`raymarch.*`, `slice.*`), `luts.ts` (colormaps). |
| `src/state/` | `store.ts` (zustand, metadata only), `resources.ts` (voxel arrays + File handles). |
| `src/ui/` | `App` (stage switch), `DropZone`, `SeriesBrowser`, `viewer/` (QuadViewport, Toolbar, panels, Hotkeys). |

## Key decisions (see docs/PLAN.html §2)

- **State two-tier** — reactive store holds only small metadata; voxel arrays and
  textures live in a module-level registry reached via refs. High-frequency
  updates (W/L, crosshair) use transient zustand subscriptions that mutate
  uniforms and `invalidate()`, never React re-renders.
- **Manual multi-viewport** — the MPR quad is rendered by an explicit
  `useFrame` loop with four scissored viewports (three.js multiple-views
  pattern) rather than drei `<View>`, for deterministic viewport placement.
- **GPU disposal** — textures/materials live only in uniforms (invisible to
  R3F auto-dispose); they are created and disposed inside effects, so study
  swaps and StrictMode double-mounts stay leak-free.
- **Local-only** — enforced at three layers: build-time dist grep, runtime CSP
  (`connect-src 'self'`), and a Playwright zero-network test.

See also [COORDINATES.md](COORDINATES.md) and [CODECS.md](CODECS.md).
