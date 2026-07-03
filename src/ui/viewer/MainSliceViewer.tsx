import { useCallback, useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { getVolume } from '../../state/resources';
import { useViewer, type Orientation } from '../../state/store';
import { drawVolumeSlice, fitSliceViewport, sliceAxisFor } from '../../volume/sample';

interface CanvasSize {
  width: number;
  height: number;
}

const MAX_CANVAS_PIXELS = 1_600_000;

export function MainSliceViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 1, height: 1 });
  const orientation = useViewer((s) => s.orientation);
  const crosshairTex = useViewer((s) => s.crosshairTex);
  const windowClim = useViewer((s) => s.windowClim);
  const invert = useViewer((s) => s.invert);
  const captureNonce = useViewer((s) => s.captureNonce);
  const volumeVersion = useViewer((s) => s.volumeVersion);
  const set = useViewer((s) => s.set);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const entry = getVolume();
    if (!canvas || !entry) return;
    const axis = sliceAxisFor(orientation);
    const crosshair = crosshairFor(orientation, crosshairTex);
    drawVolumeSlice(canvas, entry.volume, orientation, crosshairTex[axis], {
      window: windowClim,
      invert,
      crosshair,
      width: canvasSize.width,
      height: canvasSize.height,
      fitToPhysicalAspect: true,
    });
  }, [canvasSize.height, canvasSize.width, crosshairTex, invert, orientation, windowClim]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return undefined;

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      let width = Math.max(1, Math.floor(rect.width * Math.min(window.devicePixelRatio || 1, 2)));
      let height = Math.max(1, Math.floor(rect.height * Math.min(window.devicePixelRatio || 1, 2)));
      const pixels = width * height;
      if (pixels > MAX_CANVAS_PIXELS) {
        const scale = Math.sqrt(MAX_CANVAS_PIXELS / pixels);
        width = Math.max(1, Math.floor(width * scale));
        height = Math.max(1, Math.floor(height * scale));
      }
      setCanvasSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    draw();
  }, [draw, volumeVersion]);

  useEffect(() => {
    if (captureNonce === 0) return;
    draw();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mri-snapshot.png';
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }, [captureNonce, draw]);

  const updateFromPointer = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const entry = getVolume();
    if (!canvas || !entry) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    const viewport = fitSliceViewport(entry.volume, orientation, canvas.width, canvas.height);
    if (
      x < viewport.x ||
      x > viewport.x + viewport.width ||
      y < viewport.y ||
      y > viewport.y + viewport.height
    ) {
      return;
    }
    const u = clamp((x - viewport.x) / viewport.width);
    const v = clamp(1 - (y - viewport.y) / viewport.height);
    set({ crosshairTex: crosshairFromPlane(orientation, crosshairTex, u, v), cine: false });
  };

  const onWheel = (e: WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const entry = getVolume();
    if (!entry) return;
    const axis = sliceAxisFor(orientation);
    const dim = entry.volume.dims[axis];
    const current = Math.round(crosshairTex[axis] * (dim - 1));
    const nextIdx = Math.min(dim - 1, Math.max(0, current + (e.deltaY > 0 ? 1 : -1)));
    const next = [...crosshairTex] as [number, number, number];
    next[axis] = dim > 1 ? nextIdx / (dim - 1) : 0.5;
    set({ crosshairTex: next, cine: false });
  };

  const labels = axisLabels(orientation);

  return (
    <div className="main-slice-stage">
      <canvas
        ref={canvasRef}
        data-testid="main-slice-canvas"
        className="main-slice-canvas"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          updateFromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) updateFromPointer(e);
        }}
        onWheel={onWheel}
      />
      <span className="slice-label top">{labels.top}</span>
      <span className="slice-label bottom">{labels.bottom}</span>
      <span className="slice-label left">{labels.left}</span>
      <span className="slice-label right">{labels.right}</span>
    </div>
  );
}

function crosshairFor(orientation: Orientation, p: readonly number[]): [number, number] {
  if (orientation === 'axial') return [p[0]!, p[1]!];
  if (orientation === 'sagittal') return [p[1]!, p[2]!];
  return [p[0]!, p[2]!];
}

function crosshairFromPlane(
  orientation: Orientation,
  current: readonly number[],
  u: number,
  v: number,
): [number, number, number] {
  const next = [...current] as [number, number, number];
  if (orientation === 'axial') {
    next[0] = u;
    next[1] = v;
  } else if (orientation === 'sagittal') {
    next[1] = u;
    next[2] = v;
  } else {
    next[0] = u;
    next[2] = v;
  }
  return next;
}

function axisLabels(orientation: Orientation): { top: string; bottom: string; left: string; right: string } {
  if (orientation === 'axial') return { top: 'A', bottom: 'P', left: 'R', right: 'L' };
  if (orientation === 'sagittal') return { top: 'S', bottom: 'I', left: 'P', right: 'A' };
  return { top: 'S', bottom: 'I', left: 'R', right: 'L' };
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
