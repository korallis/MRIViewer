import * as THREE from 'three';
import type { AssembledVolume } from '../dicom/types';

/** LPS → RAS (world): negate X and Y. World is Z-up = patient Superior (PLAN §6). */
const RAS_FROM_LPS = new THREE.Matrix4().makeScale(-1, -1, 1);

/** Row-major number[16] → THREE.Matrix4 (Matrix4.set takes row-major). */
function fromRowMajor(m: readonly number[]): THREE.Matrix4 {
  // prettier-ignore
  return new THREE.Matrix4().set(
    m[0]!, m[1]!, m[2]!, m[3]!,
    m[4]!, m[5]!, m[6]!, m[7]!,
    m[8]!, m[9]!, m[10]!, m[11]!,
    m[12]!, m[13]!, m[14]!, m[15]!,
  );
}

/** uvw ∈ [0,1]³ → voxel index: voxel = uvw·dims − 0.5 (IPP is a voxel CENTER). */
function voxelFromTexture(dims: readonly number[]): THREE.Matrix4 {
  return new THREE.Matrix4()
    .makeTranslation(-0.5, -0.5, -0.5)
    .multiply(new THREE.Matrix4().makeScale(dims[0]!, dims[1]!, dims[2]!));
}

export function worldFromTexture(volume: AssembledVolume): THREE.Matrix4 {
  return new THREE.Matrix4()
    .multiply(RAS_FROM_LPS)
    .multiply(fromRowMajor(volume.lpsFromVoxel))
    .multiply(voxelFromTexture(volume.dims));
}

/** Mesh matrix for a unit box: local [-0.5,0.5]³ → texture (+0.5) → world. */
export function meshMatrix(volume: AssembledVolume): THREE.Matrix4 {
  return worldFromTexture(volume).multiply(new THREE.Matrix4().makeTranslation(0.5, 0.5, 0.5));
}

export interface VolumeFrame {
  center: THREE.Vector3;
  /** Physical extent along the volume grid axes, mm. */
  size: THREE.Vector3;
  /** Bounding-sphere-ish radius for camera framing. */
  radius: number;
}

export function volumeFrame(volume: AssembledVolume): VolumeFrame {
  const m = worldFromTexture(volume);
  const center = new THREE.Vector3(0.5, 0.5, 0.5).applyMatrix4(m);
  const size = new THREE.Vector3(
    volume.dims[0] * volume.spacing[0],
    volume.dims[1] * volume.spacing[1],
    volume.dims[2] * volume.spacing[2],
  );
  return { center, size, radius: size.length() / 2 };
}

/** Texture-space point → world (for crosshairs, measurements). */
export function texToWorld(volume: AssembledVolume, p: readonly number[]): THREE.Vector3 {
  return new THREE.Vector3(p[0]!, p[1]!, p[2]!).applyMatrix4(worldFromTexture(volume));
}

export function worldToTex(volume: AssembledVolume, world: THREE.Vector3): THREE.Vector3 {
  return world.clone().applyMatrix4(worldFromTexture(volume).clone().invert());
}
