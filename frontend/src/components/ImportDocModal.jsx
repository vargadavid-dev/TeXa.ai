import { useState, useEffect } from 'react'
import {
  Upload,
  FileCode,
  Sigma,
  Atom,
  X,
  Check,
  Loader2,
  FileText,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react'

export default function ImportDocModal({
  isOpen,
  pendingFiles = [],
  currentSubject = 'Matematika',
  onClose,
  onConfirm
}) {
  const isMultiple = pendingFiles.length > 1
  const initialSingle = pendingFiles[0] || {}

  const [singleSubject, setSingleSubject] = useState(
    initialSingle.meta?.subject || currentSubject
  )
  const [singleFilename, setSingleFilename] = useState(
    initialSingle.targetName || initialSingle.meta?.filename || 'importalt_dokumentum.tex'
  )
  const [openAndCompile, setOpenAndCompile] = useState(true)

  // Több fájl esetén: fájlonkénti tantárgy állapot
  const [multiSubjects, setMultiSubjects] = useState(() => {
    const map = {}
    pendingFiles.forEach((f, idx) => {
      map[idx] = f.meta?.subject || currentSubject
    })
    return map
  })
  const [isImporting, setIsImporting] = useState(false)

  useEffect(() => {
    if (initialSingle) {
      setSingleSubject(initialSingle.meta?.subject || currentSubject)
      setSingleFilename(initialSingle.targetName || initialSingle.meta?.filename || 'importalt_dokumentum.tex')
    }
  }, [initialSingle, currentSubject])

  if (!isOpen || pendingFiles.length === 0) return null

  const handleImportSingle = async () => {
    if (!singleFilename.trim() || isImporting) return
    setIsImporting(true)
    try {
      const cleanName = singleFilename.trim().endsWith('.tex')
        ? singleFilename.trim()
        : `${singleFilename.trim()}.tex`

      await onConfirm([
        {
          subject: singleSubject,
          filename: cleanName,
          content: initialSingle.content,
          openNow: openAndCompile
        }
      ])
    } finally {
      setIsImporting(false)
    }
  }

  const handleImportMultiple = async () => {
    if (isImporting) return
    setIsImporting(true)
    try {
      const itemsToImport = pendingFiles.map((f, idx) => {
        const cleanName = f.targetName.endsWith('.tex') ? f.targetName : `${f.targetName}.tex`
        return {
          subject: multiSubjects[idx] || currentSubject,
          filename: cleanName,
          content: f.content,
          openNow: idx === 0 && openAndCompile // Az elsőt nyitjuk meg azonnal, ha kéri
        }
      })
      await onConfirm(itemsToImport)
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        {/* Modál fejléc */}
        <div className="modal-header">
          <div className="modal-title">
            <Upload size={18} color="var(--accent)" />
            <span>
              {isMultiple
                ? `Több LaTeX fájl importálása (${pendingFiles.length} db)`
                : 'LaTeX (.tex) Fájl Importálása'}
            </span>
          </div>
          <button className="btn-subtle" onClick={onClose} disabled={isImporting}>
            <X size={16} />
          </button>
        </div>

        {/* ── Egyetlen fájl importálása ── */}
        {!isMultiple && (
          <>
            {/* Eredeti fájl infó kártya */}
            <div className="import-file-meta-box">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileCode size={16} color="var(--accent-light)" />
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {initialSingle.file?.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Méret: {Math.max(1, Math.round((initialSingle.file?.size || 0) / 1024))} KB ·{' '}
                    {initialSingle.content.split('\n').length} sor
                  </div>
                </div>
              </div>
              {initialSingle.meta?.displayTitle && (
                <span
                  style={{
                    fontSize: 11,
                    background: 'var(--bg-elevated)',
                    padding: '2px 8px',
                    borderRadius: 4,
                    color: 'var(--accent-light)',
                    maxWidth: 180,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  title={initialSingle.meta.displayTitle}
                >
                  {initialSingle.meta.displayTitle}
                </span>
              )}
            </div>

            {/* Cél Tantárgy (Matematika / Fizika) */}
            <div className="form-group">
              <label className="form-label">Cél Tantárgy (Mappa)</label>
              <div className="subject-switcher" style={{ width: '100%' }}>
                <button
                  type="button"
                  className={`subject-btn ${singleSubject === 'Matematika' ? 'active math' : ''}`}
                  onClick={() => setSingleSubject('Matematika')}
                  style={{ flex: 1, justifyContent: 'center', padding: '8px 12px' }}
                >
                  <Sigma size={14} />
                  Matematika
                </button>
                <button
                  type="button"
                  className={`subject-btn ${singleSubject === 'Fizika' ? 'active physics' : ''}`}
                  onClick={() => setSingleSubject('Fizika')}
                  style={{ flex: 1, justifyContent: 'center', padding: '8px 12px' }}
                >
                  <Atom size={14} />
                  Fizika
                </button>
              </div>
            </div>

            {/* Fájlnév */}
            <div className="form-group">
              <label className="form-label">Mentési fájlnév (.tex)</label>
              <input
                className="form-input"
                value={singleFilename}
                onChange={(e) => setSingleFilename(e.target.value)}
                placeholder="pl. differencialszamitas.tex"
                disabled={isImporting}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleImportSingle()
                }}
              />
            </div>

            {/* Rövid betekintő a fájl tartalmába */}
            <div className="form-group">
              <label className="form-label">Fájl tartalom előnézete</label>
              <div className="import-snippet-preview">
                {initialSingle.content.slice(0, 400)}
                {initialSingle.content.length > 400 && '\n... [további tartalom elrejtve]'}
              </div>
            </div>

            {/* Opció: azonnali megnyitás és fordítás */}
            <label
              className="custom-checkbox-wrap"
              style={{ marginTop: 2 }}
              onClick={() => setOpenAndCompile((v) => !v)}
            >
              <div className={`custom-checkbox-box ${openAndCompile ? 'checked' : ''}`}>
                {openAndCompile && <Check size={12} strokeWidth={3} />}
              </div>
              <span>Megnyitás a szerkesztőben és azonnali PDF fordítás</span>
            </label>
          </>
        )}

        {/* ── Több fájl kötegelt importálása ── */}
        {isMultiple && (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              A kiválasztott {pendingFiles.length} db LaTeX fájl bekerül a projektek közé. Ellenőrizd a célmappákat:
            </div>

            <div className="import-multi-file-list">
              {pendingFiles.map((f, idx) => {
                const sub = multiSubjects[idx] || currentSubject
                return (
                  <div key={idx} className="import-multi-file-item">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                      <FileCode size={14} color="var(--accent-light)" />
                      <span
                        style={{
                          fontWeight: 500,
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: 220
                        }}
                        title={f.file.name}
                      >
                        {f.file.name}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button
                        type="button"
                        className={`btn-subtle ${sub === 'Matematika' ? 'active' : ''}`}
                        onClick={() =>
                          setMultiSubjects((prev) => ({ ...prev, [idx]: 'Matematika' }))
                        }
                        style={{
                          padding: '3px 8px',
                          fontSize: 11,
                          color: sub === 'Matematika' ? 'var(--text-primary)' : 'var(--text-muted)'
                        }}
                      >
                        <Sigma size={12} />
                        Matek
                      </button>
                      <button
                        type="button"
                        className={`btn-subtle ${sub === 'Fizika' ? 'active' : ''}`}
                        onClick={() =>
                          setMultiSubjects((prev) => ({ ...prev, [idx]: 'Fizika' }))
                        }
                        style={{
                          padding: '3px 8px',
                          fontSize: 11,
                          color: sub === 'Fizika' ? 'var(--text-primary)' : 'var(--text-muted)'
                        }}
                      >
                        <Atom size={12} />
                        Fizika
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <label
              className="custom-checkbox-wrap"
              style={{ marginTop: 4 }}
              onClick={() => setOpenAndCompile((v) => !v)}
            >
              <div className={`custom-checkbox-box ${openAndCompile ? 'checked' : ''}`}>
                {openAndCompile && <Check size={12} strokeWidth={3} />}
              </div>
              <span>Első fájl azonnali megnyitása a szerkesztőben</span>
            </label>
          </>
        )}

        {/* Akció gombok */}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose} disabled={isImporting}>
            Mégse
          </button>
          <button
            className="btn btn-primary"
            onClick={isMultiple ? handleImportMultiple : handleImportSingle}
            disabled={(!isMultiple && !singleFilename.trim()) || isImporting}
          >
            {isImporting ? (
              <>
                <Loader2 size={14} className="spinner" />
                Importálás folyamatban...
              </>
            ) : (
              <>
                <Upload size={14} />
                {isMultiple
                  ? `Mind a ${pendingFiles.length} fájl importálása`
                  : 'Importálás & Mentés'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
