import { useViewer } from '../state/store';

/** Placeholder — replaced by the R3F viewport quad in Phase 3/4. */
export function ViewerShell() {
  const selectedKey = useViewer((s) => s.selectedKey);
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
      <p>
        Volume loaded: <code>{selectedKey}</code> — renderer lands in Phase 3.
      </p>
    </div>
  );
}
