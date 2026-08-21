import { useState } from 'react'
import {
  MIN_PAGE_MARGIN_MM,
  MAX_PAGE_MARGIN_MM,
  PAGE_SIZE_OPTIONS,
  type PageSize
} from '../../shared/preferences'

interface PageSetupModalProps {
  initialPageSize: PageSize
  initialMarginMm: number
  initialAuthorName: string | null
  onSave: (pageSize: PageSize, marginMm: number, authorName: string | null) => Promise<void>
  onClose: () => void
}

function PageSetupModal(props: PageSetupModalProps): JSX.Element {
  const { initialPageSize, initialMarginMm, initialAuthorName, onSave, onClose } = props
  const [pageSize, setPageSize] = useState<PageSize>(initialPageSize)
  const [marginMm, setMarginMm] = useState(String(initialMarginMm))
  const [authorName, setAuthorName] = useState(initialAuthorName ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave(): Promise<void> {
    setSaving(true)
    const parsed = Number(marginMm)
    const clamped = Math.min(MAX_PAGE_MARGIN_MM, Math.max(MIN_PAGE_MARGIN_MM, Number.isFinite(parsed) ? parsed : initialMarginMm))
    await onSave(pageSize, clamped, authorName.trim() || null)
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Page setup</h2>
        <p className="modal-message">
          Drives the page-count preview, PDF export, and printing — one shared page size, not something local to
          just the preview. Standard manuscript format overrides the margin with its required 1 inch.
        </p>

        <div className="typography-form">
          <label className="typography-field">
            <span>Page size</span>
            <select value={pageSize} onChange={(e) => setPageSize(e.target.value as PageSize)}>
              {/* Built from the shared list, so adding a size in
                  preferences.ts is all that is needed here too. */}
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="typography-field">
            <span>Margins (mm, all sides)</span>
            <input
              type="number"
              min={MIN_PAGE_MARGIN_MM}
              max={MAX_PAGE_MARGIN_MM}
              className="typography-field-input"
              style={{ marginBottom: 0 }}
              value={marginMm}
              onChange={(e) => setMarginMm(e.target.value)}
            />
          </label>
          <label className="typography-field">
            <span>Author name (manuscript header)</span>
            <input
              type="text"
              className="typography-field-input"
              style={{ marginBottom: 0 }}
              placeholder="e.g. Jack Moore"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
            />
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="modal-cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="modal-confirm modal-confirm--primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default PageSetupModal
