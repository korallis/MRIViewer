import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import {
  GizmoHelper,
  GizmoViewport,
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
  View,
} from '@react-three/drei';
import { CameraRig, Volume3D } from './viewer/Volume3D';
import {
  crosshairPercent,
  SliceScene,
  usePaneInteraction,
  type PaneKind,
} from './viewer/SlicePane';
import { Toolbar } from './viewer/Toolbar';
import { makeVolumeTexture } from '../volume/texture';
import { getVolume } from '../state/resources';
import { useViewer } from '../state/store';

const PANES: PaneKind[] = ['axial', 'sagittal', 'coronal'];

export function ViewerShell() {
  const container = useRef<HTMLDivElement>(null!);
  const volumeVersion = useViewer((s) => s.volumeVersion);
  const [volumeTexture, setVolumeTexture] = useState<THREE.Data3DTexture | null>(null);

  // The ONE shared 3D texture — uploaded once, sampled by all four views (PLAN D10).
  useEffect(() => {
    const entry = getVolume();
    if (!entry) {
      setVolumeTexture(null);
      return;
    }
    const tex = makeVolumeTexture(entry.volume);
    setVolumeTexture(tex);
    return () => tex.dispose();
  }, [volumeVersion]);

  return (
    <div
      ref={container}
      style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <Toolbar />
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows: '1fr 1fr',
          gap: 2,
          padding: 2,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {PANES.map((pane) => (
          <MprPane key={pane} pane={pane} volumeTexture={volumeTexture} />
        ))}
        <div style={{ position: 'relative', background: '#000', borderRadius: 4, overflow: 'hidden' }}>
          <PaneLabel text="3D" />
          <View style={{ position: 'absolute', inset: 0 }}>
            <ThreeDCameras />
            <Volume3D volumeTexture={volumeTexture} />
            <GizmoHelper alignment="bottom-right" margin={[56, 56]}>
              <GizmoViewport
                axisColors={['#e8556a', '#3ecf8e', '#4f8cff']}
                labels={['R', 'A', 'S']}
              />
            </GizmoHelper>
          </View>
        </div>
      </div>
      <Canvas
        frameloop="demand"
        flat
        linear
        eventSource={container}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
        style={{ position: 'absolute', inset: 0, zIndex: 0 }}
      >
        <View.Port />
      </Canvas>
    </div>
  );
}

function ThreeDCameras() {
  const orthographic = useViewer((s) => s.orthographic);
  const controlsRef = useRef<any>(null);
  const set = useViewer((s) => s.set);
  return (
    <>
      <PerspectiveCamera makeDefault={!orthographic} fov={45} up={[0, 0, 1]} />
      <OrthographicCamera makeDefault={orthographic} up={[0, 0, 1]} />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping={false}
        // Interaction-time quality scaling (PLAN §7.2): coarser steps while dragging.
        onStart={() => set({ quality: 0.45 })}
        onEnd={() => set({ quality: 1 })}
      />
      <CameraRig controls={controlsRef} />
    </>
  );
}

function MprPane({
  pane,
  volumeTexture,
}: {
  pane: PaneKind;
  volumeTexture: THREE.Data3DTexture | null;
}) {
  const paneRef = useRef<HTMLDivElement>(null!);
  const { layout, setCrosshairFromEvent, scrub } = usePaneInteraction(pane);
  const crosshairTex = useViewer((s) => s.crosshairTex);
  const dragging = useRef(false);
  const cross = crosshairPercent(layout, crosshairTex);
  const sliceAxis = layout?.axes.sliceAxis ?? 2;
  const dim = layout ? layout.dims[sliceAxis]! : 1;
  const sliceIndex = Math.round(crosshairTex[sliceAxis]! * (dim - 1));

  // Native non-passive wheel listener so preventDefault actually works.
  useEffect(() => {
    const el = paneRef.current;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      scrub(e.deltaY > 0 ? 1 : -1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [scrub]);

  return (
    <div
      ref={paneRef}
      data-testid={`pane-${pane}`}
      style={{ position: 'relative', background: '#000', borderRadius: 4, overflow: 'hidden', cursor: 'crosshair' }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        dragging.current = true;
        setCrosshairFromEvent(e.currentTarget, e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (dragging.current) setCrosshairFromEvent(e.currentTarget, e.clientX, e.clientY);
      }}
      onPointerUp={() => (dragging.current = false)}
      onPointerLeave={() => (dragging.current = false)}
    >
      <PaneLabel text={`${pane.toUpperCase()} · ${sliceIndex + 1}/${dim}`} />
      {layout && (
        <>
          <EdgeLabel pos="left" text={layout.axes.labels[0]} />
          <EdgeLabel pos="right" text={layout.axes.labels[1]} />
          <EdgeLabel pos="top" text={layout.axes.labels[2]} />
          <EdgeLabel pos="bottom" text={layout.axes.labels[3]} />
        </>
      )}
      {cross && (
        <>
          <div
            style={{
              position: 'absolute',
              left: `${cross.x}%`,
              top: 0,
              bottom: 0,
              width: 1,
              background: 'rgba(79,140,255,0.55)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: `${cross.y}%`,
              left: 0,
              right: 0,
              height: 1,
              background: 'rgba(79,140,255,0.55)',
              pointerEvents: 'none',
            }}
          />
        </>
      )}
      <View style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <OrthographicCamera makeDefault position={[0, 0, 10]} />
        <SliceScene pane={pane} volumeTexture={volumeTexture} />
      </View>
    </div>
  );
}

function PaneLabel({ text }: { text: string }) {
  return (
    <span
      style={{
        position: 'absolute',
        top: 6,
        left: 8,
        fontSize: 11,
        color: 'var(--text-dim)',
        zIndex: 2,
        pointerEvents: 'none',
      }}
    >
      {text}
    </span>
  );
}

function EdgeLabel({ pos, text }: { pos: 'left' | 'right' | 'top' | 'bottom'; text: string }) {
  const style: React.CSSProperties = {
    position: 'absolute',
    fontSize: 11,
    color: 'rgba(219,226,240,0.6)',
    zIndex: 2,
    pointerEvents: 'none',
  };
  if (pos === 'left') Object.assign(style, { left: 6, top: '50%', transform: 'translateY(-50%)' });
  if (pos === 'right') Object.assign(style, { right: 6, top: '50%', transform: 'translateY(-50%)' });
  if (pos === 'top') Object.assign(style, { top: 4, left: '50%', transform: 'translateX(-50%)' });
  if (pos === 'bottom') Object.assign(style, { bottom: 4, left: '50%', transform: 'translateX(-50%)' });
  return <span style={style}>{text}</span>;
}
