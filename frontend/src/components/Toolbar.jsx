import { useState, useEffect } from 'react'
import {
  Infinity as InfinityIcon,
  FileText,
  Layers,
  Settings,
  HelpCircle,
  X,
  Keyboard,
  Sparkles
} from 'lucide-react'

export default function Toolbar({
  currentFile,
  isModified,
  autoSaveStatus = 'saved',
  onSave,
  onOpenPreambles,
  onOpenSettings,
  hasCustomKey = false
}) {
  const [showHelpModal, setShowHelpModal] = useState(false)

  // ⌘/ vagy Ctrl+/ gyorsbillentyű a súgóhoz
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault()
        setShowHelpModal((v) => !v)
      } else if (e.key === 'Escape' && showHelpModal) {
        setShowHelpModal(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showHelpModal])

  const fileName = currentFile ? currentFile.name : 'Névtelen.tex'

  return (
    <div className="toolbar">
      {/* Bal oldal: Márkajelzés és verzió */}
      <div className="toolbar-left">
        <div className="toolbar-brand">
          <div className="toolbar-logo-icon" title="TeXa AI">
            <InfinityIcon size={16} strokeWidth={2.4} />
          </div>
          <div className="toolbar-title-wrap">
            <div className="toolbar-title">
              TeXa <span className="toolbar-title-ai">AI</span>
            </div>
          </div>
          <span className="toolbar-version-badge">v3.9</span>
        </div>
      </div>

      {/* Közép: Aktív dokumentum neve és finom mentési státusz pont */}
      <div className="toolbar-center">
        <div
          className="toolbar-doc-pill"
          onClick={onSave}
          title={
            isModified
              ? 'Nem mentett változtatások (Kattints az azonnali mentéshez, vagy nyomj ⌘S-t)'
              : 'Minden változtatás mentve'
          }
        >
          <FileText size={13} className="toolbar-doc-icon" />
          <span className="toolbar-doc-name">{fileName}</span>
          <span className="toolbar-doc-divider" />
          <span className="toolbar-save-status">
            <span
              className={`toolbar-status-dot ${
                autoSaveStatus === 'saving'
                  ? 'saving'
                  : isModified
                  ? 'modified'
                  : 'saved'
              }`}
            />
            <span className="toolbar-status-label">
              {autoSaveStatus === 'saving'
                ? 'Mentés…'
                : isModified
                ? 'Módosítva'
                : 'Mentve'}
            </span>
          </span>
        </div>
      </div>

      {/* Jobb oldal: Globális rendszerfunkciók */}
      <div className="toolbar-right">
        <button
          type="button"
          className="btn toolbar-btn"
          onClick={onOpenPreambles}
          title="Preambulumok és sablonok kezelése"
          id="btn-preambles"
        >
          <Layers size={13} />
          <span>Preambulumok</span>
        </button>

        <button
          type="button"
          className="btn toolbar-btn"
          onClick={onOpenSettings}
          title={
            hasCustomKey
              ? 'Rendszerbeállítások & Munkakörnyezet (Saját Gemini API kulcs aktív 🟢)'
              : 'Rendszerbeállítások & Munkakörnyezet (Nincs Gemini API kulcs beállítva! 🔴)'
          }
          id="btn-settings"
        >
          <Settings size={13} />
          <span>Beállítások</span>
          <span
            className="toolbar-settings-dot"
            style={{
              background: hasCustomKey ? '#30d158' : '#ff453a'
            }}
          />
        </button>

        <button
          type="button"
          className="btn toolbar-btn"
          onClick={() => setShowHelpModal(true)}
          title="Gyorsbillentyűk és Súgó (⌘/)"
          id="btn-help"
        >
          <HelpCircle size={13} />
          <span>Súgó</span>
        </button>
      </div>

      {/* Súgó & Gyorsbillentyűk Modális Ablak */}
      {showHelpModal && (
        <div className="modal-overlay" onClick={() => setShowHelpModal(false)}>
          <div
            className="modal help-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 520 }}
          >
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="column-header-icon-wrap">
                  <Keyboard size={13} />
                </div>
                <div className="modal-title">Gyorsbillentyűk & Súgó</div>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowHelpModal(false)}
                title="Bezárás (Esc)"
              >
                <X size={15} />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '16px 20px' }}>
              <div className="help-shortcuts-grid">
                <div className="help-shortcut-row">
                  <span className="help-shortcut-desc">Dokumentum mentése & PDF fordítás</span>
                  <kbd className="help-kbd">⌘S</kbd>
                </div>
                <div className="help-shortcut-row">
                  <span className="help-shortcut-desc">AI gyors-kijelölés a szerkesztőben</span>
                  <kbd className="help-kbd">⌘K</kbd>
                </div>
                <div className="help-shortcut-row">
                  <span className="help-shortcut-desc">Visszavonás / Újra</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <kbd className="help-kbd">⌘Z</kbd>
                    <kbd className="help-kbd">⌘⇧Z</kbd>
                  </div>
                </div>
                <div className="help-shortcut-row">
                  <span className="help-shortcut-desc">SyncTeX: Ugrás a PDF megfelelő sorára</span>
                  <kbd className="help-kbd">⌘ + Kattintás</kbd>
                </div>
                <div className="help-shortcut-row">
                  <span className="help-shortcut-desc">SyncTeX: Ugrás a PDF-ből a forráskódra</span>
                  <span className="help-hint-tag">Dupla kattintás a PDF-en</span>
                </div>
                <div className="help-shortcut-row">
                  <span className="help-shortcut-desc">Gyorsbillentyűk megnyitása</span>
                  <kbd className="help-kbd">⌘/</kbd>
                </div>
              </div>

              <div className="help-pro-tip">
                <Sparkles size={14} style={{ color: '#0a84ff', flexShrink: 0 }} />
                <span>
                  <strong>TeXa Pro Tipp:</strong> A PDF-en jelölj ki bármilyen képletet vagy bekezdést az <em>Átszerkesztés</em> eszközzel, és az AI azonnal átfogalmazza vagy új TikZ ábrát illeszt be a helyére!
                </span>
              </div>
            </div>

            <div className="modal-footer" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowHelpModal(false)}
                style={{ height: 28, padding: '0 14px', fontSize: 12 }}
              >
                Rendben
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
