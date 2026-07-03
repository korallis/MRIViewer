import { ingestFiles } from '../ingest/ingest';
import type { FoundFile } from '../ingest/traverse';
import { useViewer } from '../state/store';

/**
 * E2E-only bridge: lets Playwright feed fixture bytes without a real folder
 * drop and drive store state. Gated on ?e2e — never exposed in a normal session.
 */
export function installTestHooks(): void {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('e2e')) return;
  const w = window as unknown as Record<string, unknown>;
  w.__mriIngest = async (files: Array<{ name: string; bytes: number[] }>) => {
    const found: FoundFile[] = files.map((f) => ({
      file: new File([new Uint8Array(f.bytes)], f.name),
      path: f.name,
    }));
    await ingestFiles(found);
  };
  w.__mriSetState = (partial: Record<string, unknown>) => useViewer.getState().set(partial as never);
  w.__mriGetState = () => {
    const s = useViewer.getState();
    return { stage: s.stage, windowClim: s.windowClim, crosshairTex: s.crosshairTex };
  };
}
