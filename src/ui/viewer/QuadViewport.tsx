import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { shallow } from 'zustand/shallow';
import raymarchVert from '../../render/shaders/raymarch.vert?raw';
import raymarchFrag from '../../render/shaders/raymarch.frag?raw';
import sliceVert from '../../render/shaders/slice.vert?raw';
import sliceFrag from '../../render/shaders/slice.frag?raw';
import { getLutTexture, type ColormapName } from '../../render/luts';
import { makeVolumeTexture } from '../../volume/texture';
import { meshMatrix, volumeFrame } from '../../volume/matrices';
import { paneLayout, type PaneKind, type PaneLayout } from './SlicePane';
import { applyWindowLevelDrag } from './windowing';
import { getVolume } from '../../state/resources';
import { useViewer } from '../../state/store';

/**
 * Deterministic 2×2 multi-viewport renderer (three.js "multiple views" pattern).
 * One Canvas, one WebGL context, one shared Data3DTexture; four scissored
 * viewports rendered manually so viewport placement is fully under our control.
 * Layout (screen): axial top-left, sagittal top-right, coronal bottom-left, 3D bottom-right.
 */

const MPR_PANES: PaneKind[] = ['axial', 'sagittal', 'coronal'];

interface OrbitState {
  azimuth: number;
  polar: number;
  radius: number;
  target: THREE.Vector3;
}

// Lets DOM overlay handlers (outside the Canvas) request a redraw in demand mode.
let requestRedraw: () => void = () => {};

export function QuadViewport({ needsReadback }: { needsReadback: boolean }) {
  const wrapperRef = useRef<HTMLDivElement>(null!);
  return (
    <div ref={wrapperRef} style={{ position: 'relative', flex: 1, minHeight: 0 }}>
      <Canvas
        frameloop={needsReadback ? 'always' : 'demand'}
        flat
        linear
        gl={{
          antialias: false,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: true, // reliable PNG export + e2e pixel probes
        }}
        dpr={[1, 2]}
        style={{ position: 'absolute', inset: 0 }}
      >
        <QuadScene />
      </Canvas>
      <QuadOverlay />
    </div>
  );
}

function QuadScene() {
  const volumeVersion = useViewer((s) => s.volumeVersion);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    requestRedraw = invalidate;
    return () => {
      requestRedraw = () => {};
    };
  }, [invalidate]);

  const [built, setBuilt] = useState<{
    volTex: THREE.Data3DTexture;
    volScene: THREE.Scene;
    volMat: THREE.ShaderMaterial;
    sliceScenes: Record<PaneKind, THREE.Scene>;
    sliceMats: Record<PaneKind, THREE.ShaderMaterial>;
    layouts: Record<PaneKind, PaneLayout>;
    frame: ReturnType<typeof volumeFrame>;
  } | null>(null);

  const orbit = useRef<OrbitState>({ azimuth: 0.9, polar: 1.1, radius: 1, target: new THREE.Vector3() });
  const [contextEpoch, setContextEpoch] = useState(0);

  // WebGL context-loss recovery (PLAN §5.7): swallow the loss, rebuild GPU
  // resources from the retained CPU-side volume on restore.
  useEffect(() => {
    const canvas = gl.domElement;
    const onLost = (e: Event) => {
      e.preventDefault();
      useViewer.getState().pushError('Graphics context lost — restoring…');
    };
    const onRestored = () => setContextEpoch((n) => n + 1);
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    };
  }, [gl]);

  useEffect(() => {
    void contextEpoch; // rebuild GPU resources after a context restore
    const entry = getVolume();
    if (!entry) {
      setBuilt(null);
      return;
    }
    const v = entry.volume;
    const s = useViewer.getState();
    const volTex = makeVolumeTexture(v);

    const volMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_data: { value: volTex },
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
    const volMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), volMat);
    volMesh.matrixAutoUpdate = false;
    volMesh.matrix.copy(meshMatrix(v));
    volMesh.frustumCulled = false;
    const volScene = new THREE.Scene();
    volScene.add(volMesh);

    const sliceScenes = {} as Record<PaneKind, THREE.Scene>;
    const sliceMats = {} as Record<PaneKind, THREE.ShaderMaterial>;
    const layouts = {} as Record<PaneKind, PaneLayout>;
    for (const pane of MPR_PANES) {
      const layout = paneLayout(v, pane, s.convention);
      layouts[pane] = layout;
      const mat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
          u_data: { value: volTex },
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
      sliceMats[pane] = mat;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(layout.physW, layout.physH), mat);
      const scene = new THREE.Scene();
      scene.add(mesh);
      sliceScenes[pane] = scene;
    }

    const frame = volumeFrame(v);
    orbit.current = {
      azimuth: 0.9,
      polar: 1.1,
      radius: frame.radius * 2.6,
      target: frame.center.clone(),
    };
    (window as unknown as Record<string, unknown>).__mriOrbit = orbit;

    setBuilt({ volTex, volScene, volMat, sliceScenes, sliceMats, layouts, frame });
    invalidate();
    return () => {
      volTex.dispose();
      volMat.dispose();
      volMesh.geometry.dispose();
      for (const pane of MPR_PANES) {
        sliceMats[pane]!.dispose();
        (sliceScenes[pane]!.children[0] as THREE.Mesh).geometry.dispose();
      }
    };
  }, [volumeVersion, contextEpoch, invalidate]);

  // React to uniform-affecting store changes.
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
            s.crosshairTex,
            s.slabHalf,
          ] as const,
        (vals) => {
          if (!built) return;
          const [clim, mode, iso, quality, invert, cmin, cmax, colormap, crosshair, slabHalf] = vals;
          const lut = getLutTexture(colormap as ColormapName);
          const vu = built.volMat.uniforms;
          (vu.u_clim!.value as THREE.Vector2).set(clim[0], clim[1]);
          vu.u_mode!.value = mode;
          vu.u_isoThreshold!.value = iso;
          vu.u_quality!.value = quality;
          vu.u_invert!.value = invert ? 1 : 0;
          (vu.u_clipMin!.value as THREE.Vector3).set(...cmin);
          (vu.u_clipMax!.value as THREE.Vector3).set(...cmax);
          vu.u_lut!.value = lut;
          for (const pane of MPR_PANES) {
            const u = built.sliceMats[pane]!.uniforms;
            (u.u_clim!.value as THREE.Vector2).set(clim[0], clim[1]);
            u.u_invert!.value = invert ? 1 : 0;
            u.u_lut!.value = lut;
            u.u_slice!.value = crosshair[built.layouts[pane]!.axes.sliceAxis];
            u.u_slabHalf!.value = slabHalf;
          }
          invalidate();
        },
        { equalityFn: shallow },
      ),
    [built, invalidate],
  );

  // Rebuild layouts (axes/labels) when convention flips.
  const convention = useViewer((s) => s.convention);
  useEffect(() => {
    if (!built) return;
    const entry = getVolume();
    if (!entry) return;
    for (const pane of MPR_PANES) {
      const layout = paneLayout(entry.volume, pane, convention);
      built.layouts[pane] = layout;
      const u = built.sliceMats[pane]!.uniforms;
      u.u_uAxis!.value = layout.axes.uAxis;
      u.u_uSign!.value = layout.axes.uSign;
      u.u_vAxis!.value = layout.axes.vAxis;
      u.u_vSign!.value = layout.axes.vSign;
      u.u_sliceAxis!.value = layout.axes.sliceAxis;
    }
    invalidate();
  }, [built, convention, invalidate]);

  const cameras = useMemo(
    () => ({
      axial: new THREE.OrthographicCamera(),
      sagittal: new THREE.OrthographicCamera(),
      coronal: new THREE.OrthographicCamera(),
      persp: new THREE.PerspectiveCamera(45, 1, 0.01, 100),
      ortho3d: new THREE.OrthographicCamera(),
    }),
    [],
  );

  const orthographic = useViewer((s) => s.orthographic);
  const viewResetNonce = useViewer((s) => s.viewResetNonce);
  useEffect(() => {
    if (!built) return;
    orbit.current.azimuth = 0.9;
    orbit.current.polar = 1.1;
    orbit.current.radius = built.frame.radius * 2.6;
    orbit.current.target = built.frame.center.clone();
    invalidate();
  }, [built, viewResetNonce, invalidate]);

  // PNG export: force a fresh frame, then download the (preserved) buffer.
  const captureNonce = useViewer((s) => s.captureNonce);
  useEffect(() => {
    if (!built || captureNonce === 0) return;
    invalidate();
    const id = requestAnimationFrame(() => {
      gl.domElement.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mriviewer.png';
        a.click();
        URL.revokeObjectURL(url);
      }, 'image/png');
    });
    return () => cancelAnimationFrame(id);
  }, [captureNonce, built, gl, invalidate]);

  // Manual multi-viewport render.
  useFrame(() => {
    if (!built) return;
    const size = new THREE.Vector2();
    gl.getSize(size);
    const dpr = gl.getPixelRatio();
    const W = size.x * dpr;
    const H = size.y * dpr;
    const halfW = Math.floor(W / 2);
    const halfH = Math.floor(H / 2);

    gl.setScissorTest(true);
    gl.autoClear = false;
    gl.setClearColor(0x000000, 1);

    // Screen layout → WebGL viewports (origin bottom-left).
    const quads: Array<{ x: number; y: number; w: number; h: number; pane: PaneKind | '3d' }> = [
      { x: 0, y: halfH, w: halfW, h: H - halfH, pane: 'axial' }, // top-left
      { x: halfW, y: halfH, w: W - halfW, h: H - halfH, pane: 'sagittal' }, // top-right
      { x: 0, y: 0, w: halfW, h: halfH, pane: 'coronal' }, // bottom-left
      { x: halfW, y: 0, w: W - halfW, h: halfH, pane: '3d' }, // bottom-right
    ];

    function renderMpr(pane: PaneKind, vpW: number, vpH: number) {
      const layout = built!.layouts[pane]!;
      const cam = cameras[pane];
      const aspect = vpW / vpH;
      const imgAspect = layout.physW / layout.physH;
      let hw: number;
      let hh: number;
      if (aspect > imgAspect) {
        hh = (layout.physH / 2) * 1.04;
        hw = hh * aspect;
      } else {
        hw = (layout.physW / 2) * 1.04;
        hh = hw / aspect;
      }
      cam.left = -hw;
      cam.right = hw;
      cam.top = hh;
      cam.bottom = -hh;
      cam.near = -10;
      cam.far = 10;
      cam.position.set(0, 0, 1);
      cam.up.set(0, 1, 0);
      cam.lookAt(0, 0, 0);
      cam.updateProjectionMatrix();
      gl.render(built!.sliceScenes[pane]!, cam);
    }

    function render3D(vpW: number, vpH: number) {
      const o = orbit.current;
      const sinP = Math.sin(o.polar);
      const dir = new THREE.Vector3(
        sinP * Math.cos(o.azimuth),
        sinP * Math.sin(o.azimuth),
        Math.cos(o.polar),
      );
      const eye = o.target.clone().addScaledVector(dir, o.radius);
      let cam: THREE.Camera;
      if (orthographic) {
        const oc = cameras.ortho3d;
        const aspect = vpW / vpH;
        const h = o.radius * 0.6;
        oc.left = -h * aspect;
        oc.right = h * aspect;
        oc.top = h;
        oc.bottom = -h;
        oc.near = 0.01;
        oc.far = o.radius * 10;
        oc.position.copy(eye);
        oc.up.set(0, 0, 1);
        oc.lookAt(o.target);
        oc.updateProjectionMatrix();
        cam = oc;
      } else {
        const pc = cameras.persp;
        pc.aspect = vpW / vpH;
        pc.near = o.radius / 100;
        pc.far = o.radius * 20;
        pc.position.copy(eye);
        pc.up.set(0, 0, 1);
        pc.lookAt(o.target);
        pc.updateProjectionMatrix();
        cam = pc;
      }
      gl.render(built!.volScene, cam);
    }

    // Clear whole buffer once, then render each scissored quad.
    gl.setViewport(0, 0, W, H);
    gl.setScissor(0, 0, W, H);
    gl.clear();
    for (const q of quads) {
      gl.setViewport(q.x, q.y, q.w, q.h);
      gl.setScissor(q.x, q.y, q.w, q.h);
      if (q.pane === '3d') render3D(q.w, q.h);
      else renderMpr(q.pane, q.w, q.h);
    }
    gl.setScissorTest(false);
    gl.autoClear = true;
  }, 1);

  return null;
}

/** DOM overlay: labels, crosshairs, and pointer interaction per quadrant. */
function QuadOverlay() {
  const volumeVersion = useViewer((s) => s.volumeVersion);
  const convention = useViewer((s) => s.convention);
  const crosshairTex = useViewer((s) => s.crosshairTex);

  const layouts = useMemo(() => {
    void volumeVersion;
    const entry = getVolume();
    if (!entry) return null;
    return {
      axial: paneLayout(entry.volume, 'axial', convention),
      sagittal: paneLayout(entry.volume, 'sagittal', convention),
      coronal: paneLayout(entry.volume, 'coronal', convention),
    };
  }, [volumeVersion, convention]);

  if (!layouts) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        pointerEvents: 'none',
      }}
    >
      <MprOverlay pane="axial" layout={layouts.axial} crosshairTex={crosshairTex} />
      <MprOverlay pane="sagittal" layout={layouts.sagittal} crosshairTex={crosshairTex} />
      <MprOverlay pane="coronal" layout={layouts.coronal} crosshairTex={crosshairTex} />
      <ThreeDOverlay />
    </div>
  );
}

function containFrac(vpW: number, vpH: number, physW: number, physH: number) {
  const aspect = vpW / vpH;
  const imgAspect = physW / physH;
  let hw: number;
  let hh: number;
  if (aspect > imgAspect) {
    hh = (physH / 2) * 1.04;
    hw = hh * aspect;
  } else {
    hw = (physW / 2) * 1.04;
    hh = hw / aspect;
  }
  return { hw, hh };
}

/** Shared right-drag → window/level. Returns handlers to spread onto a pane. */
function useWindowLevelDrag() {
  const wl = useRef<{ x: number; y: number } | null>(null);
  return {
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    down: (e: React.PointerEvent): boolean => {
      if (e.button !== 2) return false;
      wl.current = { x: e.clientX, y: e.clientY };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return true;
    },
    move: (e: React.PointerEvent): boolean => {
      if (!wl.current) return false;
      const dx = e.clientX - wl.current.x;
      const dy = e.clientY - wl.current.y;
      wl.current = { x: e.clientX, y: e.clientY };
      applyWindowLevelDrag(dx, dy);
      requestRedraw();
      return true;
    },
    up: () => {
      const was = wl.current !== null;
      wl.current = null;
      return was;
    },
  };
}

function MprOverlay({
  pane,
  layout,
  crosshairTex,
}: {
  pane: PaneKind;
  layout: PaneLayout;
  crosshairTex: readonly number[];
}) {
  const ref = useRef<HTMLDivElement>(null!);
  const dragging = useRef(false);
  const wl = useWindowLevelDrag();
  const dim = layout.dims[layout.axes.sliceAxis]!;
  const sliceIndex = Math.round(crosshairTex[layout.axes.sliceAxis]! * (dim - 1));

  const toUv = (clientX: number, clientY: number): [number, number] => {
    const rect = ref.current.getBoundingClientRect();
    const fx = (clientX - rect.left) / rect.width;
    const fy = (clientY - rect.top) / rect.height;
    const { hw, hh } = containFrac(rect.width, rect.height, layout.physW, layout.physH);
    const worldX = (fx * 2 - 1) * hw;
    const worldY = (1 - fy * 2) * hh;
    let u = worldX / layout.physW + 0.5;
    let v = worldY / layout.physH + 0.5;
    u = Math.min(1, Math.max(0, u));
    v = Math.min(1, Math.max(0, v));
    if (layout.axes.uSign < 0) u = 1 - u;
    if (layout.axes.vSign < 0) v = 1 - v;
    return [u, v];
  };

  const setCrosshair = (clientX: number, clientY: number) => {
    const [u, v] = toUv(clientX, clientY);
    const s = useViewer.getState();
    const next: [number, number, number] = [...s.crosshairTex];
    next[layout.axes.uAxis] = u;
    next[layout.axes.vAxis] = v;
    s.set({ crosshairTex: next });
  };

  useEffect(() => {
    const el = ref.current;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = useViewer.getState();
      const axis = layout.axes.sliceAxis;
      const d = s.crosshairTex[axis]! + (e.deltaY > 0 ? 1 : -1) / dim;
      const next: [number, number, number] = [...s.crosshairTex];
      next[axis] = Math.min(1, Math.max(0, d));
      s.set({ crosshairTex: next });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [layout, dim]);

  // Crosshair position in this pane's image-relative coords.
  let cu = crosshairTex[layout.axes.uAxis]!;
  let cv = crosshairTex[layout.axes.vAxis]!;
  if (layout.axes.uSign < 0) cu = 1 - cu;
  if (layout.axes.vSign < 0) cv = 1 - cv;

  return (
    <div
      ref={ref}
      data-testid={`pane-${pane}`}
      style={{ position: 'relative', pointerEvents: 'auto', cursor: 'crosshair', overflow: 'hidden' }}
      onContextMenu={wl.onContextMenu}
      onPointerDown={(e) => {
        if (wl.down(e)) return;
        if (e.button !== 0) return;
        dragging.current = true;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setCrosshair(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (wl.move(e)) return;
        if (dragging.current) setCrosshair(e.clientX, e.clientY);
      }}
      onPointerUp={() => {
        wl.up();
        dragging.current = false;
      }}
    >
      <Label text={`${pane.toUpperCase()} · ${sliceIndex + 1}/${dim}`} />
      <Edge pos="left" text={layout.axes.labels[0]} />
      <Edge pos="right" text={layout.axes.labels[1]} />
      <Edge pos="top" text={layout.axes.labels[2]} />
      <Edge pos="bottom" text={layout.axes.labels[3]} />
      <div style={{ position: 'absolute', left: `${cu * 100}%`, top: 0, bottom: 0, width: 1, background: 'rgba(79,140,255,0.5)' }} />
      <div style={{ position: 'absolute', top: `${(1 - cv) * 100}%`, left: 0, right: 0, height: 1, background: 'rgba(79,140,255,0.5)' }} />
    </div>
  );
}

function ThreeDOverlay() {
  const ref = useRef<HTMLDivElement>(null!);
  const dragging = useRef<{ x: number; y: number } | null>(null);
  const wl = useWindowLevelDrag();

  const orbitOf = () =>
    (window as unknown as { __mriOrbit?: { current: OrbitState } }).__mriOrbit?.current;

  useEffect(() => {
    const el = ref.current;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const o = orbitOf();
      if (!o) return;
      o.radius *= e.deltaY > 0 ? 1.1 : 0.9;
      requestRedraw();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div
      ref={ref}
      data-testid="pane-3d"
      style={{ position: 'relative', pointerEvents: 'auto', cursor: 'grab', overflow: 'hidden' }}
      onContextMenu={wl.onContextMenu}
      onPointerDown={(e) => {
        if (wl.down(e)) return;
        dragging.current = { x: e.clientX, y: e.clientY };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (wl.move(e)) return;
        if (!dragging.current) return;
        const o = orbitOf();
        if (!o) return;
        const dx = e.clientX - dragging.current.x;
        const dy = e.clientY - dragging.current.y;
        dragging.current = { x: e.clientX, y: e.clientY };
        o.azimuth -= dx * 0.01;
        o.polar = Math.min(Math.PI - 0.05, Math.max(0.05, o.polar - dy * 0.01));
        requestRedraw();
      }}
      onPointerUp={() => {
        wl.up();
        dragging.current = null;
      }}
    >
      <Label text="3D" />
    </div>
  );
}

function Label({ text }: { text: string }) {
  return (
    <span style={{ position: 'absolute', top: 6, left: 8, fontSize: 11, color: 'var(--text-dim)', pointerEvents: 'none' }}>
      {text}
    </span>
  );
}

function Edge({ pos, text }: { pos: 'left' | 'right' | 'top' | 'bottom'; text: string }) {
  const style: React.CSSProperties = { position: 'absolute', fontSize: 11, color: 'rgba(219,226,240,0.6)', pointerEvents: 'none' };
  if (pos === 'left') Object.assign(style, { left: 6, top: '50%', transform: 'translateY(-50%)' });
  if (pos === 'right') Object.assign(style, { right: 6, top: '50%', transform: 'translateY(-50%)' });
  if (pos === 'top') Object.assign(style, { top: 4, left: '50%', transform: 'translateX(-50%)' });
  if (pos === 'bottom') Object.assign(style, { bottom: 4, left: '50%', transform: 'translateX(-50%)' });
  return <span style={style}>{text}</span>;
}
