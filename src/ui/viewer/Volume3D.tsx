import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { shallow } from 'zustand/shallow';
import raymarchVert from '../../render/shaders/raymarch.vert?raw';
import raymarchFrag from '../../render/shaders/raymarch.frag?raw';
import { getLutTexture, type ColormapName } from '../../render/luts';
import { meshMatrix, volumeFrame } from '../../volume/matrices';
import { getVolume } from '../../state/resources';
import { useViewer } from '../../state/store';

interface Gpu {
  mat: THREE.ShaderMaterial;
  matrix: THREE.Matrix4;
}

export function Volume3D({ volumeTexture }: { volumeTexture: THREE.Data3DTexture | null }) {
  const volumeVersion = useViewer((s) => s.volumeVersion);
  const invalidate = useThree((s) => s.invalidate);
  const [gpu, setGpu] = useState<Gpu | null>(null);
  const gpuRef = useRef<Gpu | null>(null);

  // Material lifecycle — the shared volume texture is owned by ViewerShell.
  // Created and disposed inside the effect so StrictMode stays leak-free.
  useEffect(() => {
    const entry = getVolume();
    if (!entry || !volumeTexture) {
      setGpu(null);
      gpuRef.current = null;
      return;
    }
    const v = entry.volume;
    const tex = volumeTexture;
    const s = useViewer.getState();
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_data: { value: tex },
        u_lut: { value: getLutTexture(s.colormap as ColormapName) },
        u_clim: { value: new THREE.Vector2(s.windowClim[0], s.windowClim[1]) },
        u_dims: { value: new THREE.Vector3(v.dims[0], v.dims[1], v.dims[2]) },
        u_clipMin: { value: new THREE.Vector3(...s.clipMin) },
        u_clipMax: { value: new THREE.Vector3(...s.clipMax) },
        u_mode: { value: s.renderMode },
        u_isoThreshold: { value: s.isoThreshold },
        u_quality: { value: s.quality },
        u_invert: { value: s.invert ? 1 : 0 },
      },
      vertexShader: raymarchVert,
      fragmentShader: raymarchFrag,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      premultipliedAlpha: true,
    });
    const next: Gpu = { mat, matrix: meshMatrix(v) };
    gpuRef.current = next;
    setGpu(next);
    invalidate();
    return () => {
      mat.dispose();
    };
  }, [volumeVersion, volumeTexture, invalidate]);

  // Transient uniform updates: no React re-render, just mutate + invalidate.
  useEffect(
    () =>
      useViewer.subscribe(
        (s) =>
          [
            s.windowClim,
            s.renderMode,
            s.isoThreshold,
            s.quality,
            s.invert,
            s.clipMin,
            s.clipMax,
            s.colormap,
          ] as const,
        ([clim, mode, iso, quality, invert, cmin, cmax, colormap]) => {
          const g = gpuRef.current;
          if (!g) return;
          const u = g.mat.uniforms;
          (u.u_clim!.value as THREE.Vector2).set(clim[0], clim[1]);
          u.u_mode!.value = mode;
          u.u_isoThreshold!.value = iso;
          u.u_quality!.value = quality;
          u.u_invert!.value = invert ? 1 : 0;
          (u.u_clipMin!.value as THREE.Vector3).set(...cmin);
          (u.u_clipMax!.value as THREE.Vector3).set(...cmax);
          u.u_lut!.value = getLutTexture(colormap as ColormapName);
          invalidate();
        },
        { equalityFn: shallow },
      ),
    [invalidate],
  );

  if (!gpu) return null;
  return (
    <mesh matrixAutoUpdate={false} matrix={gpu.matrix} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <primitive object={gpu.mat} attach="material" />
    </mesh>
  );
}

/** Frames the camera on volume load / reset: Z-up, viewed from right-anterior-superior. */
export function CameraRig({ controls }: { controls: React.RefObject<any> }) {
  const volumeVersion = useViewer((s) => s.volumeVersion);
  const viewResetNonce = useViewer((s) => s.viewResetNonce);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const entry = getVolume();
    if (!entry) return;
    const { center, radius } = volumeFrame(entry.volume);
    const dist = Math.max(radius * 2.6, 1);
    camera.up.set(0, 0, 1);
    camera.position.set(center.x + dist * 0.55, center.y + dist * 0.65, center.z + dist * 0.4);
    camera.near = dist / 100;
    camera.far = dist * 20;
    if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
      (camera as THREE.OrthographicCamera).zoom = 250 / (radius * 2.4);
    }
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    const c = controls.current;
    if (c) {
      c.target.copy(center);
      c.update();
    }
    invalidate();
  }, [volumeVersion, viewResetNonce, camera, controls, invalidate]);

  return null;
}
