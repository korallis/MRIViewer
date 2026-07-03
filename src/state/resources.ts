import type { AssembledVolume, VolumeCandidate } from '../dicom/types';

/**
 * Heavy data lives OUTSIDE reactive state (PLAN D9): voxel arrays and File
 * handles are never put in zustand. Components reach them via getVolume() and
 * key off store.volumeVersion.
 */
interface Resources {
  candidates: VolumeCandidate[];
  filesBySopUID: Map<string, File>;
  volume: AssembledVolume | null;
  volumeKey: string | null;
}

const res: Resources = {
  candidates: [],
  filesBySopUID: new Map(),
  volume: null,
  volumeKey: null,
};

export function setCandidates(candidates: VolumeCandidate[], files: Map<string, File>): void {
  res.candidates = candidates;
  res.filesBySopUID = files;
  res.volume = null;
  res.volumeKey = null;
}

export function getCandidate(key: string): VolumeCandidate | undefined {
  return res.candidates.find((c) => c.key === key);
}

export function getFile(sopUID: string): File | undefined {
  return res.filesBySopUID.get(sopUID);
}

export function setVolume(key: string, volume: AssembledVolume): void {
  res.volume = volume;
  res.volumeKey = key;
}

export function getVolume(): { key: string; volume: AssembledVolume } | null {
  return res.volume && res.volumeKey ? { key: res.volumeKey, volume: res.volume } : null;
}

export function clearVolume(): void {
  res.volume = null;
  res.volumeKey = null;
}
