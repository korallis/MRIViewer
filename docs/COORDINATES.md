# Coordinate systems (normative)

> This file is **normative**. Any change to geometry must update the phantom
> tests in `src/dicom/dicom.test.ts` in the same commit. A mirrored volume
> renders plausibly and passes casual inspection — these rules and the
> asymmetric phantom are the defense (PLAN §6).

## Spaces

| Space | Definition |
|---|---|
| **Patient (DICOM LPS)** | +X = Left, +Y = Posterior, +Z = Superior. Millimetres. |
| **Voxel** | integer `(i = column, j = row, k = slice)`. |
| **World (RAS, Z-up)** | +X = Right, +Y = Anterior, +Z = Superior. `worldFromLPS = diag(-1, -1, 1)`. Camera up = +Z. |
| **Texture (UVW)** | `uvw ∈ [0,1]³`, `uvw = (voxel + 0.5) / dims`. W increases with sorted slice index. |

## Voxel → LPS affine (DICOM PS3.3 C.7.6.2)

Columns of the rotation are, with `IOP = [rowCos(0..2), colCos(0..2)]`:

```
X̂ = rowCos · PixelSpacing[1]   (column spacing — adjacent columns)
Ŷ = colCos · PixelSpacing[0]   (row spacing — adjacent rows)
Ẑ = n̂ · zSpacing               n̂ = rowCos × colCos
T = IPP of the first sorted slice (centre of first voxel)
```

`zSpacing` = **median of consecutive projected-IPP deltas** — never
`SliceThickness` (nominal) or `SpacingBetweenSlices` (optional/sometimes wrong).

## Slice ordering

Sort ascending by `dot(n̂, IPP)`. Never `InstanceNumber`, `SliceLocation`, or
filename. Because `n̂ = rowCos × colCos` and W follows the sorted order, the
texture W axis and Ẑ agree — no mirror through the slice plane.

## Rendering matrices (`src/volume/matrices.ts`)

```
worldFromTexture = RAS_FROM_LPS · lpsFromVoxel · voxelFromTexture
meshMatrix       = worldFromTexture · translate(0.5)   // unit box [-0.5,0.5]³
```

The raymarch shader marches in texture space, so sample coordinates *are* the
3D-texture coordinates — no per-step transform.

## Display conventions

- Anatomical edge labels (A/P/L/R/S/I) are derived from the direction cosines
  per pane edge (`src/volume/orientation.ts`), shown on all four edges.
- Axial/coronal default to **radiological** convention (patient Left on screen
  right); a toolbar toggle switches to neurological.
- Anisotropic voxels: the MPR image and 3D box are scaled by real mm spacing, so
  a 0.9×0.9×5 mm acquisition renders slab-like, never cubified.

## Phantom ground truth (`tools/make-phantom.ts`)

- Bright marker (value 3000) in the patient **Left-Anterior-Superior** octant →
  must appear **top-right** in the radiological axial pane.
- 40 mm rod along +X for measurement checks.
- Spacing 1×1×2.5 mm with `SliceThickness = 2.0` (a trap).
- `InstanceNumber` reversed, filenames shuffled (a trap — geometric sort only).
