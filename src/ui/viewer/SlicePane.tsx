import { paneAxes, type PaneAxes } from '../../volume/orientation';
import type { AssembledVolume } from '../../dicom/types';

export type PaneKind = 'axial' | 'sagittal' | 'coronal';

export interface PaneLayout {
  axes: PaneAxes;
  /** Physical extent of the slice image along screen-x / screen-y, mm. */
  physW: number;
  physH: number;
  dims: readonly number[];
}

export function paneLayout(
  volume: AssembledVolume,
  pane: PaneKind,
  convention: 'radiological' | 'neurological',
): PaneLayout {
  const axes = paneAxes(volume, pane, convention);
  return {
    axes,
    physW: volume.dims[axes.uAxis] * volume.spacing[axes.uAxis],
    physH: volume.dims[axes.vAxis] * volume.spacing[axes.vAxis],
    dims: volume.dims,
  };
}
