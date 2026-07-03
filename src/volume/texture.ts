import * as THREE from 'three';
import type { AssembledVolume } from '../dicom/types';

/**
 * R16F volume texture (PLAN D3): half-float bit patterns via toHalfFloat —
 * linear-filterable in core WebGL2, half the memory of R32F, ~11 bits of
 * mantissa (enough for 12-bit MRI).
 */
export function makeVolumeTexture(volume: AssembledVolume): THREE.Data3DTexture {
  const [nx, ny, nz] = volume.dims;
  const half = new Uint16Array(volume.data.length);
  for (let i = 0; i < volume.data.length; i++) {
    half[i] = THREE.DataUtils.toHalfFloat(volume.data[i]!);
  }
  const tex = new THREE.Data3DTexture(half, nx, ny, nz);
  tex.format = THREE.RedFormat;
  tex.type = THREE.HalfFloatType;
  tex.minFilter = THREE.LinearFilter; // Data3DTexture defaults to Nearest — must override
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}
