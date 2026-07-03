# MRIViewer

Open-source, **local-only** web app for viewing MRI DICOM studies as fully interactive 3D volume renders.

Drop a folder of DICOM files onto the app and explore the study as a GPU-raymarched 3D volume — rotate, clip, adjust window/level and transfer functions, and scrub linked axial/sagittal/coronal (MPR) slice views.

Built with **React Three Fiber** on WebGL2. No server, no uploads, no telemetry: everything runs in your browser on `localhost`, and your imaging data never leaves your machine.

## Status

🚧 Planning phase. The full implementation plan lives in [`docs/PLAN.html`](docs/PLAN.html) — a detailed, phase-by-phase specification written for agentic AI execution (Claude Code).

## Planned stack

- **React + TypeScript + Vite** — static build that runs entirely offline
- **React Three Fiber + drei + three.js** — WebGL2 volume raymarching via `Data3DTexture`
- **dicom-parser + WASM codecs** — browser-side DICOM parsing in Web Workers
- **zustand** — state, with volume data kept outside React

## Privacy

MRIViewer is designed to be run locally and never deployed to a public web server. The production build makes **zero network requests** — all assets are bundled, and a strict CSP blocks outbound traffic.

## License

MIT
