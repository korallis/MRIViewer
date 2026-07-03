import { useViewer } from '../../state/store';
import { getVolume } from '../../state/resources';
import { sliceAxisFor } from '../../volume/sample';
import { AiCompanion } from './AiCompanion';

export function CompanionPanel() {
  const orientation = useViewer((s) => s.orientation);
  const viewMode = useViewer((s) => s.viewMode);
  const renderMode = useViewer((s) => s.renderMode);
  const crosshairTex = useViewer((s) => s.crosshairTex);
  const volumeVersion = useViewer((s) => s.volumeVersion);
  void volumeVersion;

  const entry = getVolume();
  const v = entry?.volume;
  const axis = sliceAxisFor(orientation);
  const dim = v ? v.dims[axis] : 0;
  const sliceIdx = v ? Math.round(crosshairTex[axis] * (dim - 1)) : 0;
  const voxels = v ? v.dims[0] * v.dims[1] * v.dims[2] : 0;

  const meta = v?.meta;
  const metaRows: Array<[string, string]> = meta
    ? [
        ['Patient', meta.patientName || '—'],
        ['Patient ID', meta.patientID || '—'],
        ['Study date', meta.studyDate || '—'],
        ['Series', meta.seriesDescription || '—'],
        ['Modality', meta.modality || '—'],
        ['Dimensions', v!.dims.join(' × ')],
        ['Spacing (mm)', v!.spacing.map((s) => s.toFixed(2)).join(' × ')],
        ['Bits', `${meta.bitsStored}${meta.pixelRepresentation ? ' signed' : ''}`],
        ['Encoding', meta.transferSyntaxUID],
      ]
    : [];

  return (
    <aside className="panel companion-panel">
      <div className="panel-header">
        <h2>Companion</h2>
        <p>Live study metrics, DICOM metadata, and the evidence-review pipeline.</p>
      </div>
      <div className="panel-body">
        <div className="metric-grid">
          <div className="metric"><span>Series</span><strong>{cap(orientation)}</strong></div>
          <div className="metric" data-testid="slice-metric"><span>Slice</span><strong>{v ? `${sliceIdx}/${dim - 1}` : '—'}</strong></div>
          <div className="metric"><span>Volume</span><strong>{v ? compact(voxels) : '—'}</strong></div>
          <div className="metric"><span>View</span><strong>{viewMode === 'slices' ? 'Slices' : renderName(renderMode)}</strong></div>
        </div>

        {v ? (
          <>
            <div className="finding">
              <h3>Study metadata <span className="confidence">on-device</span></h3>
              <table className="meta-table">
                <tbody>
                  {metaRows.map(([k, val]) => (
                    <tr key={k}><td>{k}</td><td>{val}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="note">
              🔒 Metadata may contain PHI. Everything shown is processed on this machine and never
              uploaded. De-identification runs before any future AI analysis leaves the device.
            </div>
          </>
        ) : (
          <div className="finding">
            <h3>No study loaded <span className="confidence next">waiting</span></h3>
            <p>Load a DICOM folder from the Studies panel to populate live metrics and metadata.</p>
          </div>
        )}

        <AiCompanion />

        <div className="timeline">
          <div className="timeline-item"><strong>1 · Ingest</strong>DICOM folder → parse, validate geometry, reconstruct volume (done).</div>
          <div className="timeline-item"><strong>2 · View</strong>3D volume, orthogonal slices, orientation, window/level, export (done).</div>
          <div className="timeline-item"><strong>3 · Reason</strong>De-identify → AI contextual analysis via the LegalOS lane (opt-in, above).</div>
          <div className="timeline-item"><strong>4 · Draft</strong>Medical chronology, damages narrative, disclosure bundle (next).</div>
        </div>

        <div className="note">Not a clinical/diagnostic viewer. Evidence-review and interaction tool only.</div>
      </div>
    </aside>
  );
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function renderName(m: number) { return m === 0 ? 'MIP' : m === 2 ? 'ISO' : '3D DVR'; }
function compact(n: number) {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M voxels` : n >= 1e3 ? `${Math.round(n / 1e3)}k voxels` : `${n}`;
}
