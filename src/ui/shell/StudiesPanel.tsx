import { useCallback, useRef, useState } from 'react';
import {
  filesFromDataTransfer,
  filesFromDirectoryPicker,
  filesFromFileList,
  supportsDirectoryPicker,
} from '../../ingest/traverse';
import { ingestFiles, loadSeries } from '../../ingest/ingest';
import { useViewer } from '../../state/store';

export function StudiesPanel() {
  const candidates = useViewer((s) => s.candidates);
  const selectedKey = useViewer((s) => s.selectedKey);
  const report = useViewer((s) => s.report);
  const stage = useViewer((s) => s.stage);
  const pushError = useViewer((s) => s.pushError);
  const [hover, setHover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setHover(false);
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
    <aside className="panel">
      <div className="panel-header">
        <h2>Studies</h2>
        <p>Drop a DICOM folder to ingest and reconstruct a 3D volume — all on this machine.</p>
      </div>
      <div className="panel-body">
        <label
          className={`drop-zone ${hover ? 'hover' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setHover(true);
          }}
          onDragLeave={() => setHover(false)}
          onDrop={onDrop}
        >
          <strong>Drop DICOM folder here</strong>
          <span style={{ fontSize: 12 }}>or use the buttons below · files never leave this machine</span>
          <input
            ref={inputRef}
            type="file"
            multiple
            {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                void ingestFiles(filesFromFileList(e.target.files));
              }
              e.target.value = '';
            }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
            <button onClick={(e) => { e.preventDefault(); inputRef.current?.click(); }}>Choose folder…</button>
            {supportsDirectoryPicker() && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  filesFromDirectoryPicker()
                    .then((f) => void ingestFiles(f))
                    .catch((err: unknown) => {
                      if ((err as Error)?.name !== 'AbortError') pushError(String(err));
                    });
                }}
              >
                System picker…
              </button>
            )}
          </div>
        </label>

        {report && (
          <p style={{ color: 'var(--dim)', fontSize: 12, margin: '0 0 12px' }}>
            {report.dicomFiles} DICOM · {report.skippedNonDicom} skipped
            {report.unreadable.length > 0 && ` · ${report.unreadable.length} unreadable`}
          </p>
        )}

        {stage === 'idle' && !report && (
          <div className="note" style={{ marginTop: 0 }}>
            No study loaded yet. The synthetic phantom fixtures in <code>fixtures/</code> are handy for a quick demo.
          </div>
        )}

        {candidates.map((c) => (
          <button
            key={c.key}
            data-testid="series-card"
            data-reconstructable={c.reconstructable}
            className={`study-card ${selectedKey === c.key ? 'active' : ''}`}
            disabled={!c.reconstructable}
            onClick={() => c.reconstructable && void loadSeries(c.key)}
          >
            {c.thumbnail && <img className="study-thumb" src={c.thumbnail} alt="" />}
            <div className="study-top">
              <div>
                <div className="study-name">{c.description}</div>
                <div className="study-meta">{c.dims} · {c.sliceCount} slices</div>
              </div>
              {selectedKey === c.key && <span className="tag">Open</span>}
            </div>
            <div className="tag-row">
              {c.multiframe && <span className="tag warn">enhanced MR</span>}
              {c.lossySource && <span className="tag warn">lossy</span>}
              {c.unsupportedSyntax && <span className="tag danger">unsupported</span>}
              {c.warnings.slice(0, 1).map((w) => (
                <span key={w} className="tag warn">{w}</span>
              ))}
              {!c.multiframe && !c.lossySource && !c.unsupportedSyntax && c.warnings.length === 0 && (
                <span className="tag">reconstructable</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
