import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Vec3 } from '../dicom/types';

export type Stage = 'idle' | 'ingesting' | 'browsing' | 'loading' | 'viewing';
export type RenderMode = 0 | 1 | 2; // 0=MIP 1=DVR 2=ISO

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
  errors: string[];
  announce: string;
  set: (partial: Partial<ViewerState>) => void;
  pushError: (message: string) => void;
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
    errors: [],
    announce: '',
    set: (partial) => set(partial),
    pushError: (message) => set((s) => ({ errors: [...s.errors.slice(-4), message], announce: message })),
  })),
);
