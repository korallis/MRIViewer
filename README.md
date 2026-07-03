# MRIViewer

Open-source, **local-only** web app for viewing MRI DICOM studies as fully interactive 3D volume renders.

Drop a folder of DICOM files onto the app and explore the study as a GPU-raymarched 3D volume — rotate, clip, adjust window/level and colormaps, and scrub linked axial/sagittal/coronal (MPR) slice views.

Built with **React Three Fiber** on WebGL2. No server, no uploads, no telemetry: everything runs in your browser on `localhost`, and your imaging data never leaves your machine.

> ⚠️ **Not a medical device. Not for diagnostic use.** Educational / research tool. Not affiliated with EPAM's "MRI Viewer".

## Screenshots

Multi-planar reconstruction quad (three linked slice views + 3D) with DVR, MIP, and shaded iso-surface render modes, plus grayscale / viridis / hot-iron colormaps.

## Quick start

Requires Node ≥ 20.19 (or ≥ 22.12) and a desktop browser with WebGL2 (Chrome, Edge, or Firefox).

```bash
npm install
npm run dev          # http://localhost:5173
```

Then drag a folder of DICOM files onto the window, or click **Choose folder…**.

To build and run the static bundle (also fully local):

```bash
npm run build
npm run preview      # or: npx serve dist
```

> The build **cannot** be opened via `file://` — ES modules require an HTTP origin. Serve `dist/` from any static server; `localhost` counts as a secure context.

## Features

- **Ingest** — drag-and-drop or folder picker; hundreds of files; multiple studies/series with a thumbnail browser. Files identified by content (`DICM` magic), not extension.
- **Formats** — Implicit/Explicit VR, Deflated, RLE Lossless, and Enhanced (multi-frame) MR. JPEG/JPEG2000/JPEG-LS/HTJ2K are wired behind an optional WASM codec (see [docs/CODECS.md](docs/CODECS.md)).
- **3D** — raymarched DVR, MIP, and Blinn-Phong shaded iso-surface; perspective/orthographic; axis-aligned clip box; orientation gizmo.
- **MPR** — axial / sagittal / coronal panes from one shared 3D texture, linked crosshairs, wheel scrub, thick-slab MIP, A/P/L/R/S/I edge labels, radiological/neurological toggle.
- **Tools** — window/level (right-drag; `1`–`9` percentile presets), colormaps, invert, PNG export, metadata panel, keyboard shortcuts.

### Keyboard shortcuts

`m` MIP · `d` DVR · `s` ISO · `i` invert · `1`–`9` W/L presets · `↑`/`↓` scrub · `space` reset view. Right-drag = window/level.

## Privacy

The production build makes **zero network requests** — enforced three ways: a build-time grep of `dist/` for external URLs, a strict runtime CSP (`connect-src 'self'`), and a Playwright test that aborts any non-local request during a full load+render. DICOM headers can contain PHI; nothing is logged or persisted.

## Development

```bash
npm run check        # typecheck + lint + unit tests
npm run phantom      # regenerate synthetic DICOM fixtures
npm test             # Vitest unit tests
npm run e2e          # Playwright (builds + serves + browser tests)
```

The DICOM pipeline (`src/dicom/`) is pure TypeScript and unit-tested against a synthetic **asymmetric phantom** that makes slice ordering, spacing, intensity handling, and — critically — anatomical orientation machine-checkable. See [docs/COORDINATES.md](docs/COORDINATES.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

The full implementation plan is in [docs/PLAN.html](docs/PLAN.html).

## License

MIT — see [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
