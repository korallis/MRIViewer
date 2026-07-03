import { ingestFiles } from '../ingest/ingest';
import type { FoundFile } from '../ingest/traverse';

/**
 * E2E-only bridge: lets Playwright feed fixture bytes without a real folder
 * drop. Gated on ?e2e — never exposed in a normal session.
 */
export function installTestHooks(): void {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('e2e')) return;
  (window as unknown as Record<string, unknown>).__mriIngest = async (
    files: Array<{ name: string; bytes: number[] }>,
  ) => {
    const found: FoundFile[] = files.map((f) => ({
      file: new File([new Uint8Array(f.bytes)], f.name),
      path: f.name,
    }));
    await ingestFiles(found);
  };
}
