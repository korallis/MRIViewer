import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { shallow } from 'zustand/shallow';
import raymarchVert from '../../render/shaders/raymarch.vert?raw';
import raymarchFrag from '../../render/shaders/raymarch.frag?raw';
import { getLutTexture, type ColormapName } from '../../render/luts';
import { makeVolumeTexture } from '../../volume/texture';
import { meshMatrix, volumeFrame } from '../../volume/matrices';
import { getVolume } from '../../state/resources';
import { useViewer, type CameraKind } from '../../state/store';

/** Single large WebGL raymarched volume — the real engine, orbit-able. */
export function SceneViewer({ needsReadback }: { needsReadback: boolean }) {
  return (
    <Canvas
      frameloop={needsReadback ? 'always' : 'demand'}
      flat
      linear
      gl={{ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
      dpr={[1, 2]}
      style={{ position: 'absolute', inset: 0 }}
    >
      <PerspectiveCamera makeDefault fov={45} up={[0, 0, 1]} position={[300, 300, 200]} />
      <VolumeMesh />
      <CameraDriver />
      <FrameDriver />
    </Canvas>
  );
}

function VolumeMesh() {
  const volumeVersion = useViewer((s) => s.volumeVersion);
  const invalidate = useThree((s) => s.invalidate);
  const [gpu, setGpu] = useState<{ mat: THREE.ShaderMaterial; matrix: THREE.Matrix4 } | null>(null);
  const matRef = useRef<THREE.ShaderMaterial | null>(null);

  useEffect(() => {
    const entry = getVolume();
    if (!entry) {
      setGpu(null);
      matRef.current = null;
      return;
    }
    const v = entry.volume;
    const tex = makeVolumeTexture(v);
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
        u_opacity: { value: s.opacity },
      },
      vertexShader: raymarchVert,
      fragmentShader: raymarchFrag,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      premultipliedAlpha: true,
    });
    matRef.current = mat;
    setGpu({ mat, matrix: meshMatrix(v) });
    invalidate();
    return () => {
      tex.dispose();
      mat.dispose();
    };
  }, [volumeVersion, invalidate]);

  useEffect(
    () =>
      useViewer.subscribe(
        (s) =>
          [s.windowClim, s.renderMode, s.isoThreshold, s.quality, s.invert, s.clipMin, s.clipMax, s.colormap, s.opacity] as const,
        ([clim, mode, iso, quality, invert, cmin, cmax, colormap, opacity]) => {
          const u = matRef.current?.uniforms;
          if (!u) return;
          (u.u_clim!.value as THREE.Vector2).set(clim[0], clim[1]);
          u.u_mode!.value = mode;
          u.u_isoThreshold!.value = iso;
          u.u_quality!.value = quality;
          u.u_invert!.value = invert ? 1 : 0;
          (u.u_clipMin!.value as THREE.Vector3).set(...cmin);
          (u.u_clipMax!.value as THREE.Vector3).set(...cmax);
          u.u_lut!.value = getLutTexture(colormap as ColormapName);
          u.u_opacity!.value = opacity;
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

/** Applies orientation / view-preset camera commands and interaction quality. */
function CameraDriver() {
  const controlsRef = useRef<any>(null);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const volumeVersion = useViewer((s) => s.volumeVersion);
  const cameraCmd = useViewer((s) => s.cameraCmd);
  const set = useViewer((s) => s.set);
  const centerRef = useRef(new THREE.Vector3());
  const radiusRef = useRef(200);

  useEffect(() => {
    const entry = getVolume();
    if (!entry) return;
    const f = volumeFrame(entry.volume);
    centerRef.current.copy(f.center);
    radiusRef.current = Math.max(f.radius, 1);
    applyCamera('reset');
  }, [volumeVersion]);

  useEffect(() => {
    applyCamera(cameraCmd.kind);
  }, [cameraCmd.nonce]);

  function applyCamera(kind: CameraKind) {
    const c = centerRef.current;
    const r = radiusRef.current;
    const d = r * 2.6;
    // Directions in RAS world (Z-up). Axial=look down -Z, coronal=from front (-Y), sagittal=from left (-X).
    const dirs: Record<CameraKind, [number, number, number]> = {
      reset: [0.55, 0.65, 0.4],
      axial: [0.001, 0.001, 1],
      coronal: [0, -1, 0.001],
      sagittal: [-1, 0.001, 0.001],
      front: [0, -1, 0.2],
      side: [1, 0.1, 0.2],
      top: [0.001, 0.001, 1],
    };
    const dir = new THREE.Vector3(...(dirs[kind] ?? dirs.reset)).normalize();
    camera.up.set(0, 0, 1);
    camera.position.copy(c).addScaledVector(dir, d);
    (camera as THREE.PerspectiveCamera).near = d / 100;
    (camera as THREE.PerspectiveCamera).far = d * 20;
    camera.lookAt(c);
    camera.updateProjectionMatrix();
    if (controlsRef.current) {
      controlsRef.current.target.copy(c);
      controlsRef.current.update();
    }
    invalidate();
  }

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping={false}
      onStart={() => set({ quality: 0.4 })}
      onEnd={() => set({ quality: 1 })}
    />
  );
}

/** PNG export + cine slice advancement, driven from inside the canvas. */
function FrameDriver() {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const captureNonce = useViewer((s) => s.captureNonce);

  useEffect(() => {
    if (captureNonce === 0) return;
    invalidate();
    const id = requestAnimationFrame(() => {
      gl.domElement.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mri-snapshot.png';
        a.click();
        URL.revokeObjectURL(url);
      }, 'image/png');
    });
    return () => cancelAnimationFrame(id);
  }, [captureNonce, gl, invalidate]);

  // Cine: advance the current orientation's slice on a wall-clock cadence and
  // keep requesting frames (demand mode).
  const acc = useRef(0);
  useFrame((_, delta) => {
    const s = useViewer.getState();
    if (!s.cine) return;
    acc.current += delta;
    if (acc.current >= 0.06) {
      acc.current = 0;
      const entry = getVolume();
      if (!entry) return;
      const axis = s.orientation === 'axial' ? 2 : s.orientation === 'sagittal' ? 0 : 1;
      const dim = entry.volume.dims[axis];
      const next = [...s.crosshairTex] as [number, number, number];
      next[axis] = (next[axis] + 1 / dim) % 1;
      s.set({ crosshairTex: next });
    }
    invalidate();
  });
  return null;
}
