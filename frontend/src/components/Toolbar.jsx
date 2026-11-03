import {
  Save,
  FilePlus,
  FileText,
  LayoutTemplate,
  Download,
  Sigma,
  Infinity as InfinityIcon,
  Loader2,
  CheckCircle2,
  Layers,
  Upload,
  Undo2,
  Redo2,
  Settings
} from 'lucide-react'

export default function Toolbar({
  currentFile,
  isModified,
  compileStatus,
  currentSubject,
  onSubjectChange,
  categories = [],
  onCreateCategory,
  onCompile,
  onSave,
  autoSaveEnabled = true,
  onToggleAutoSave,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onNewBlankDoc,
  onNewDoc,
  onImportDoc,
  onOpenPreambles,
  onOpenSettings,
  hasCustomKey = false,
  onDownloadPdf,
  hasPdf,
  aiPanelOpen,
  onToggleAi,
  sidebarCollapsed = false,
  onToggleSidebar,
  activeModel = 'Gemini 3.8 Flash',
  apiOk = true
}) {
  return (
    <div className="toolbar">
      {/* Brand logo */}
      <div className="toolbar-brand">
        <div className="toolbar-logo-icon" title="TeXa AI">
          <InfinityIcon size={19} strokeWidth={2.4} />
        </div>
        <div className="toolbar-title-wrap">
          <div className="toolbar-title">
            TeXa <span className="toolbar-title-ai">AI</span>
          </div>
        </div>
      </div>

      <div className="toolbar-divider" />

      {/* Visszavonás és Újra gombok */}
      <button
        className="btn btn-ghost"
        onClick={onUndo}
        disabled={!canUndo}
        title="Módosítás visszavonása (⌘Z vagy Ctrl+Z)"
        id="btn-undo"
      >
        <Undo2 size={14} />
        Visszavonás
      </button>

      <button
        className="btn btn-ghost"
        onClick={onRedo}
        disabled={!canRedo}
        title="Visszavont módosítás megismétlése (⌘⇧Z vagy Ctrl+Y)"
        id="btn-redo"
      >
        <Redo2 size={14} />
        Újra
      </button>

      {/* Mentés és Automatikus Mentés kapcsoló */}
      <div className="toolbar-save-group">
        <button
          className="btn btn-ghost"
          onClick={onSave}
          title="Dokumentum azonnali mentése (⌘S)"
          id="btn-save"
        >
          <Save size={14} />
          Mentés
        </button>
        <button
          className={`btn toolbar-autosave-toggle ${autoSaveEnabled ? 'active' : ''}`}
          onClick={onToggleAutoSave}
          title={autoSaveEnabled ? 'Automatikus mentés BEKAPCSOLVA (Kattints a kikapcsoláshoz)' : 'Automatikus mentés KIKAPCSOLVA (Kattints a bekapcsoláshoz)'}
          id="btn-toggle-autosave"
        >
          <span className={`autosave-status-dot ${autoSaveEnabled ? 'active' : ''}`} />
          Auto-mentés
        </button>
      </div>

      <button
        className="btn btn-ghost"
        onClick={onNewBlankDoc}
        title="Új üres dokumentum létrehozása sablon nélkül"
        id="btn-new-blank"
      >
        <FileText size={14} />
        Üres dokumentum
      </button>

      <button
        className="btn btn-ghost"
        onClick={onNewDoc}
        title="Új dokumentum létrehozása sablonból"
        id="btn-new"
      >
        <LayoutTemplate size={14} />
        Új sablon
      </button>

      <button
        className="btn btn-ghost"
        onClick={onImportDoc}
        title="Létező .tex fájl importálása a számítógépről"
        id="btn-import"
      >
        <Upload size={14} />
        Importálás
      </button>

      <button
        className="btn btn-ghost"
        onClick={onOpenPreambles}
        title="Egyéni és mester preambulumok / sablonok kezelése"
        id="btn-preambles"
      >
        <Layers size={14} color="var(--accent-light)" />
        Preambulumok
      </button>

      <button
        className="btn btn-ghost"
        onClick={onOpenSettings}
        title={
          hasCustomKey
            ? 'Rendszerbeállítások & Munkakörnyezet (Saját Gemini API kulcs aktív 🟢)'
            : 'Rendszerbeállítások & Munkakörnyezet (Nincs Gemini API kulcs beállítva! 🔴)'
        }
        id="btn-settings"
        style={{ position: 'relative' }}
      >
        <Settings size={14} />
        <span>Beállítások</span>
        <span
          style={{
            position: 'absolute',
            top: 5,
            right: 5,
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: hasCustomKey ? '#4ade80' : '#f87171',
            boxShadow: hasCustomKey ? '0 0 6px #4ade80' : '0 0 8px #f87171'
          }}
        />
      </button>

      {hasPdf && (
        <button
          className="btn btn-ghost"
          onClick={onDownloadPdf}
          title="Elkészült PDF letöltése a számítógépre"
        >
          <Download size={14} />
          PDF Letöltés
        </button>
      )}
    </div>
  )
}
