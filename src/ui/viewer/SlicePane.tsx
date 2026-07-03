import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { shallow } from 'zustand/shallow';
import sliceVert from '../../render/shaders/slice.vert?raw';
import sliceFrag from '../../render/shaders/slice.frag?raw';
import { getLutTexture, type ColormapName } from '../../render/luts';
import { paneAxes, type PaneAxes } from '../../volume/orientation';
import { getVolume } from '../../state/resources';
import { useViewer } from '../../state/store';
import type { AssembledVolume } from '../../dicom/types';

export type PaneKind = 'axial' | 'sagittal' | 'coronal';

export interface PaneLayout {
  axes: PaneAxes;
  physW: number;
  physH: number;
  dims: readonly number[];
}

export function paneLayout(volume: AssembledVolume, pane: PaneKind, convention: 'radiological' | 'neurological'): PaneLayout {
  const axes = paneAxes(volume, pane, convention);
  return {
    axes,
    physW: volume.dims[axes.uAxis] * volume.spacing[axes.uAxis],
    physH: volume.dims[axes.vAxis] * volume.spacing[axes.vAxis],
    dims: volume.dims,
  };
}

/** The R3F scene for one MPR pane: a quad sampling the shared 3D texture. */
export function SliceScene({ pane, volumeTexture }: { pane: PaneKind; volumeTexture: THREE.Data3DTexture | null }) {
  const volumeVersion = useViewer((s) => s.volumeVersion);
  const convention = useViewer((s) => s.convention);
  const invalidate = useThree((s) => s.invalidate);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const [scene, setScene] = useState<{ mat: THREE.ShaderMaterial; layout: PaneLayout } | null>(null);
  const matRef = useRef<THREE.ShaderMaterial | null>(null);
  const layoutRef = useRef<PaneLayout | null>(null);

  useEffect(() => {
    const entry = getVolume();
    if (!entry || !volumeTexture) {
      setScene(null);
      matRef.current = null;
      layoutRef.current = null;
      return;
    }
    const v = entry.volume;
    const layout = paneLayout(v, pane, convention);
    const s = useViewer.getState();
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_data: { value: volumeTexture },
        u_lut: { value: getLutTexture(s.colormap as ColormapName) },
        u_clim: { value: new THREE.Vector2(s.windowClim[0], s.windowClim[1]) },
        u_invert: { value: s.invert ? 1 : 0 },
        u_uAxis: { value: layout.axes.uAxis },
        u_uSign: { value: layout.axes.uSign },
        u_vAxis: { value: layout.axes.vAxis },
        u_vSign: { value: layout.axes.vSign },
        u_sliceAxis: { value: layout.axes.sliceAxis },
        u_slice: { value: s.crosshairTex[layout.axes.sliceAxis] },
        u_slabHalf: { value: s.slabHalf },
        u_dimSlice: { value: v.dims[layout.axes.sliceAxis] },
      },
      vertexShader: sliceVert,
      fragmentShader: sliceFrag,
    });
    matRef.current = mat;
    layoutRef.current = layout;
    setScene({ mat, layout });
    invalidate();
    return () => mat.dispose();
  }, [volumeVersion, volumeTexture, pane, convention, invalidate]);

  // Fit the ortho camera to the slice's physical extent (aspect-correct, mm-true).
  useEffect(() => {
    if (!scene) return;
    const cam = camera as THREE.OrthographicCamera;
    if (!cam.isOrthographicCamera) return;
    const zoom = Math.min(size.width / scene.layout.physW, size.height / scene.layout.physH) * 0.92;
    cam.zoom = Math.max(zoom, 0.01);
    cam.position.set(0, 0, 10);
    cam.updateProjectionMatrix();
    invalidate();
  }, [scene, camera, size, invalidate]);

  useEffect(
    () =>
      useViewer.subscribe(
        (s) => [s.windowClim, s.invert, s.colormap, s.crosshairTex, s.slabHalf] as const,
        ([clim, invert, colormap, crosshair, slabHalf]) => {
          const mat = matRef.current;
          const layout = layoutRef.current;
          if (!mat || !layout) return;
          (mat.uniforms.u_clim!.value as THREE.Vector2).set(clim[0], clim[1]);
          mat.uniforms.u_invert!.value = invert ? 1 : 0;
          mat.uniforms.u_lut!.value = getLutTexture(colormap as ColormapName);
          mat.uniforms.u_slice!.value = crosshair[layout.axes.sliceAxis];
          mat.uniforms.u_slabHalf!.value = slabHalf;
          invalidate();
        },
        { equalityFn: shallow },
      ),
    [invalidate],
  );

  if (!scene) return null;
  return (
    <mesh>
      <planeGeometry args={[scene.layout.physW, scene.layout.physH]} />
      <primitive object={scene.mat} attach="material" />
    </mesh>
  );
}

/** DOM-side interaction + overlays for one pane (crosshair, labels, scrub). */
export function usePaneInteraction(pane: PaneKind) {
  const volumeVersion = useViewer((s) => s.volumeVersion);
  const convention = useViewer((s) => s.convention);
  const layout = useMemo(() => {
    void volumeVersion; // layout depends on the current volume in resources
    const entry = getVolume();
    return entry ? paneLayout(entry.volume, pane, convention) : null;
  }, [volumeVersion, pane, convention]);

  const toTexUV = (el: HTMLElement, clientX: number, clientY: number): [number, number] | null => {
    if (!layout) return null;
    const rect = el.getBoundingClientRect();
    const zoom = Math.min(rect.width / layout.physW, rect.height / layout.physH) * 0.92;
    const imgW = layout.physW * zoom;
    const imgH = layout.physH * zoom;
    const x0 = rect.left + (rect.width - imgW) / 2;
    const y0 = rect.top + (rect.height - imgH) / 2;
    let u = (clientX - x0) / imgW;
    let vv = 1 - (clientY - y0) / imgH; // screen-y down → v up
    u = Math.min(1, Math.max(0, u));
    vv = Math.min(1, Math.max(0, vv));
    if (layout.axes.uSign < 0) u = 1 - u;
    if (layout.axes.vSign < 0) vv = 1 - vv;
    return [u, vv];
  };

  const setCrosshairFromEvent = (el: HTMLElement, clientX: number, clientY: number) => {
    if (!layout) return;
    const uv = toTexUV(el, clientX, clientY);
    if (!uv) return;
    const s = useViewer.getState();
    const next: [number, number, number] = [...s.crosshairTex];
    next[layout.axes.uAxis] = uv[0];
    next[layout.axes.vAxis] = uv[1];
    s.set({ crosshairTex: next });
  };

  const scrub = (deltaSteps: number) => {
    if (!layout) return;
    const s = useViewer.getState();
    const axis = layout.axes.sliceAxis;
    const dim = layout.dims[axis]!;
    const next: [number, number, number] = [...s.crosshairTex];
    next[axis] = Math.min(1, Math.max(0, next[axis]! + deltaSteps / dim));
    s.set({ crosshairTex: next });
  };

  return { layout, setCrosshairFromEvent, scrub };
}

/** Crosshair position of this pane in image-relative % coordinates. */
export function crosshairPercent(
  layout: PaneLayout | null,
  crosshair: readonly number[],
): { x: number; y: number } | null {
  if (!layout) return null;
  let u = crosshair[layout.axes.uAxis]!;
  let v = crosshair[layout.axes.vAxis]!;
  if (layout.axes.uSign < 0) u = 1 - u;
  if (layout.axes.vSign < 0) v = 1 - v;
  return { x: u * 100, y: (1 - v) * 100 };
}
