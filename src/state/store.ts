import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Vec3 } from '../dicom/types';

export type Stage = 'idle' | 'ingesting' | 'browsing' | 'loading' | 'viewing';
export type RenderMode = 0 | 1 | 2; // 0=MIP 1=DVR 2=ISO
export type ViewMode = 'slices' | 'volume';
export type Orientation = 'axial' | 'sagittal' | 'coronal';
export type CameraKind = Orientation | 'front' | 'side' | 'top' | 'reset';

export interface CandidateSummary {
  key: string;
  description: string;
  sliceCount: number;
  dims: string;
  reconstructable: boolean;
  warnings: string[];
  errors: string[];
  thumbnail: string | null;
  lossySource: boolean;
  unsupportedSyntax: string | null;
  multiframe: boolean;
}

export interface IngestReport {
  totalFiles: number;
  dicomFiles: number;
  skippedNonDicom: number;
  unreadable: string[];
}

interface ViewerState {
  stage: Stage;
  progress: { done: number; total: number; label: string };
  report: IngestReport | null;
  candidates: CandidateSummary[];
  selectedKey: string | null;
  /** Bumped whenever resources.getVolume() changes — components key off it. */
  volumeVersion: number;
  windowClim: [number, number];
  viewMode: ViewMode;
  renderMode: RenderMode;
  isoThreshold: number;
  colormap: string;
  quality: number;
  orthographic: boolean;
  clipMin: Vec3;
  clipMax: Vec3;
  /** Shared crosshair position in texture space [0,1]³ — links all MPR panes. */
  crosshairTex: Vec3;
  convention: 'radiological' | 'neurological';
  invert: boolean;
  slabHalf: number;
  viewResetNonce: number;
  metadataOpen: boolean;
  clipOpen: boolean;
  captureNonce: number;
  // Prototype-style controls
  orientation: Orientation;
  opacity: number; // DVR global opacity scale (0.15..1)
  contrast: number; // window-width contrast factor (0.6..1.8)
  cine: boolean;
  cameraCmd: { kind: CameraKind; nonce: number };
  toast: string;
  toastNonce: number;
  aiEnabled: boolean;
  errors: string[];
  announce: string;
  set: (partial: Partial<ViewerState>) => void;
  pushError: (message: string) => void;
  showToast: (toast: string) => void;
  camera: (kind: CameraKind) => void;
}

export const useViewer = create<ViewerState>()(
  subscribeWithSelector((set) => ({
    stage: 'idle',
    progress: { done: 0, total: 0, label: '' },
    report: null,
    candidates: [],
    selectedKey: null,
    volumeVersion: 0,
    windowClim: [0, 1],
    viewMode: 'slices',
    renderMode: 1,
    isoThreshold: 0.35,
    colormap: 'gray',
    quality: 1,
    orthographic: false,
    clipMin: [0, 0, 0],
    clipMax: [1, 1, 1],
    crosshairTex: [0.5, 0.5, 0.5],
    convention: 'radiological',
    invert: false,
    slabHalf: 0,
    viewResetNonce: 0,
    metadataOpen: false,
    clipOpen: false,
    captureNonce: 0,
    orientation: 'axial',
    opacity: 0.85,
    contrast: 1,
    cine: false,
    cameraCmd: { kind: 'reset', nonce: 0 },
    toast: '',
    toastNonce: 0,
    // AI is OFF by default so a freshly-cloned repo stays fully local (opt-in).
    aiEnabled:
      typeof localStorage !== 'undefined' && localStorage.getItem('mriviewer.aiEnabled') === '1',
    errors: [],
    announce: '',
    set: (partial) => set(partial),
    pushError: (message) => set((s) => ({ errors: [...s.errors.slice(-4), message], announce: message })),
    showToast: (toast) => set((s) => ({ toast, toastNonce: s.toastNonce + 1, announce: toast })),
    camera: (kind) => set((s) => ({ cameraCmd: { kind, nonce: s.cameraCmd.nonce + 1 } })),
  })),
);
