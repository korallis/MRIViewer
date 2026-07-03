# Third-party notices

MRIViewer (MIT) bundles and builds on the following open-source software. All
runtime dependencies are permissively licensed (MIT / ISC / Apache-2.0 / BSD).

## Runtime dependencies

| Package | License |
|---|---|
| react, react-dom | MIT |
| three | MIT |
| @react-three/fiber, @react-three/drei | MIT |
| zustand | MIT |
| dicom-parser | MIT |
| dcmjs | MIT |
| comlink | Apache-2.0 |
| pako | MIT |
| @cornerstonejs/dicom-codec (optional, not bundled by default) | ISC |

## Build / dev dependencies

vite (MIT), vitest (MIT), @playwright/test (Apache-2.0), typescript (Apache-2.0),
eslint (MIT), prettier (MIT), @itk-wasm/dicom (Apache-2.0, dev test oracle only).

## Attribution for adapted techniques

- **Volume raymarching ray-setup** — adapted from Will Usher's "Volume Rendering
  with WebGL" and the `webgl-volume-raycaster` project (MIT).
- **MIP / ISO shading structure** — informed by three.js `VolumeShader.js` (MIT).
- **Slice-ordering / reconstructability tolerances** — modeled on OHIF and
  3D Slicer behavior (both permissive / BSD-style).

No copyleft (GPL/AGPL/CC-BY-NC) code is included. Reference-only projects that
are *not* incorporated: SuboptimalEng/volume-rendering (CC BY-NC-SA),
RolandR/VolumeRayCasting (AGPL-3.0).

## Notice

MRIViewer is **not a medical device** and is **not for diagnostic use**. It is an
educational / research visualization tool.
