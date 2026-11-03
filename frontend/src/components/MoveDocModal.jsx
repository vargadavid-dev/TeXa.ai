import { useState } from 'react'
import { FolderInput, FileText, Folder, ChevronRight, X, Check } from 'lucide-react'

export default function MoveDocModal({
  file,
  availableFolders = [],
  onClose,
  onConfirm
}) {
  const [selectedFolderDir, setSelectedFolderDir] = useState(() => {
    // Default to the first folder that is NOT the file's current directory
    if (!file?.path) return availableFolders[0]?.path || ''
    const currentDir = file.path.substring(0, file.path.lastIndexOf('/'))
    const other = availableFolders.find(f => f.path !== currentDir)
    return other ? other.path : (availableFolders[0]?.path || '')
  })

  if (!file) return null

  const currentDir = file.path ? file.path.substring(0, file.path.lastIndexOf('/')) : ''

  const handleMove = () => {
    if (!selectedFolderDir) return
    onConfirm(file, selectedFolderDir)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <FolderInput size={18} color="var(--accent-light)" />
            <span>Dokumentum áthelyezése</span>
          </div>
          <button className="btn-subtle" onClick={onClose} title="Bezárás">
            <X size={16} />
          </button>
        </div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">Áthelyezendő fájl:</label>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--text-primary)'
            }}
          >
            <FileText size={15} color="var(--accent-light)" />
            <span>{file.name}</span>
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 16 }}>
          <label className="form-label">Célkönyvtár kiválasztása:</label>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              maxHeight: 220,
              overflowY: 'auto',
              padding: '4px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)'
            }}
          >
            {availableFolders.length === 0 ? (
              <div style={{ padding: 12, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                Nincsenek elérhető mappák
              </div>
            ) : (
              availableFolders.map(folder => {
                const isCurrent = folder.path === currentDir
                const isSelected = folder.path === selectedFolderDir
                const depth = folder.depth || 0

                return (
                  <button
                    key={folder.path}
                    type="button"
                    className={`move-folder-option ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''}`}
                    onClick={() => setSelectedFolderDir(folder.path)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '7px 10px',
                      paddingLeft: 10 + depth * 16,
                      borderRadius: 'var(--radius-sm)',
                      background: isSelected ? 'var(--accent-dim)' : 'transparent',
                      border: isSelected ? '1px solid var(--accent)' : '1px solid transparent',
                      color: isSelected ? '#fff' : 'var(--text-primary)',
                      fontSize: 12.5,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.12s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                      <Folder size={14} color="#0a84ff" style={{ flexShrink: 0 }} />
                      <span style={{ fontWeight: isSelected ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {folder.relativePath || folder.name}
                      </span>
                    </div>
                    {isCurrent && (
                      <span style={{ fontSize: 10.5, color: 'var(--text-muted)', marginLeft: 8, flexShrink: 0 }}>
                        (jelenlegi hely)
                      </span>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Mégse
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleMove}
            disabled={!selectedFolderDir || selectedFolderDir === currentDir}
          >
            <FolderInput size={14} />
            Áthelyezés
          </button>
        </div>
      </div>
    </div>
  )
}
