import { useCallback, useRef, useState } from 'react';
import {
  filesFromDataTransfer,
  filesFromDirectoryPicker,
  filesFromFileList,
  supportsDirectoryPicker,
} from '../ingest/traverse';
import { ingestFiles } from '../ingest/ingest';
import { useViewer } from '../state/store';

export function DropZone() {
  const [hover, setHover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pushError = useViewer((s) => s.pushError);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setHover(false);
      // filesFromDataTransfer maps items to handles synchronously in this tick.
      filesFromDataTransfer(e.dataTransfer.items)
        .then((found) => {
          if (found.length === 0) pushError('Nothing readable in that drop — try a folder.');
          else void ingestFiles(found);
        })
        .catch((err) => pushError(String(err)));
    },
    [pushError],
  );

  return (
    <div
      role="region"
      aria-label="DICOM folder drop zone"
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={onDrop}
      style={{
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        background: hover ? 'rgba(79,140,255,0.08)' : 'transparent',
        transition: 'background 120ms',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 460, padding: 24 }}>
        <div style={{ fontSize: 44, marginBottom: 8 }} aria-hidden>
          🧠
        </div>
        <h1 style={{ fontSize: 22, margin: '0 0 6px' }}>MRIViewer</h1>
        <p style={{ color: 'var(--text-dim)', margin: '0 0 20px' }}>
          Drop a folder of MRI DICOM files here — or pick one below — to explore it as an
          interactive 3D volume.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => inputRef.current?.click()}>Choose folder…</button>
          {supportsDirectoryPicker() && (
            <button
              onClick={() =>
                filesFromDirectoryPicker()
                  .then((found) => void ingestFiles(found))
                  .catch((err: unknown) => {
                    if ((err as Error)?.name !== 'AbortError') pushError(String(err));
                  })
              }
            >
              Open with system picker…
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="visually-hidden"
          aria-hidden
          tabIndex={-1}
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              void ingestFiles(filesFromFileList(e.target.files));
            }
            e.target.value = '';
          }}
        />
        <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 24 }}>
          🔒 Everything runs in your browser. Your imaging data never leaves this machine — you can
          verify in DevTools → Network. Not a medical device; not for diagnostic use.
        </p>
      </div>
    </div>
  );
}
