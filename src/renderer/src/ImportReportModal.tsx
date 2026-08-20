import { IMPORT_WARNING_LABELS, type ImportResult } from '../../shared/import'

interface ImportReportModalProps {
  result: ImportResult
  onClose: () => void
}

/** Post-import summary. Always states what was dropped or changed rather than
 *  letting a silent transformation pass unnoticed — and stays silent itself
 *  when a file came through with nothing lost. */
function ImportReportModal(props: ImportReportModalProps): JSX.Element {
  const { result, onClose } = props
  const { documents, warnings, failures } = result
  const clean = warnings.length === 0 && failures.length === 0

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">
          {documents.length > 0
            ? `Imported ${documents.length} document${documents.length === 1 ? '' : 's'}`
            : 'Nothing imported'}
        </h2>

        {documents.length > 0 && (
          <div className="import-report-list">
            {documents.map((doc) => (
              <div key={doc.id} className="import-report-doc">
                {doc.name}
              </div>
            ))}
          </div>
        )}

        {clean && documents.length > 0 && (
          <p className="modal-message">Everything in {documents.length === 1 ? 'the file' : 'these files'} carried over — nothing was dropped.</p>
        )}

        {warnings.length > 0 && (
          <>
            <p className="modal-message import-report-heading">What changed on the way in:</p>
            <ul className="import-report-warnings">
              {warnings.map((w) => (
                <li key={w.kind}>
                  <strong>{w.count}</strong> {IMPORT_WARNING_LABELS[w.kind]}
                </li>
              ))}
            </ul>
          </>
        )}

        {failures.length > 0 && (
          <>
            <p className="modal-message import-report-heading">Could not be imported:</p>
            <ul className="import-report-failures">
              {failures.map((f) => (
                <li key={f.fileName}>
                  <strong>{f.fileName}</strong> — {f.reason}
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="modal-confirm modal-confirm--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

export default ImportReportModal
