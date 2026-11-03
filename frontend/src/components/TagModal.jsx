import { useState, useMemo } from 'react'
import { Tag, X, Plus, Check, Sparkles } from 'lucide-react'

const SUGGESTED_TAGS = [
  'Mikrotananyag',
  'Összefoglaló',
  'Gyakorló',
  'Érettségi',
  'Középszint',
  'Emelt szint',
  'Gráfelmélet',
  'Geometria',
  'Trigonometria',
  'Algebra',
  'Alapfogalmak',
  'Dinamika',
  'Optika'
]

export default function TagModal({ file, allAvailableTags = [], onClose, onSave }) {
  const [tags, setTags] = useState(file?.tags || [])
  const [newTagInput, setNewTagInput] = useState('')

  const handleAddTag = (tagToAdd) => {
    const trimmed = (tagToAdd || newTagInput).trim()
    if (!trimmed) return
    if (!tags.includes(trimmed)) {
      setTags([...tags, trimmed])
    }
    setNewTagInput('')
  }

  const handleRemoveTag = (tagToRemove) => {
    setTags(tags.filter(t => t !== tagToRemove))
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddTag()
    }
  }

  const availableSuggestions = useMemo(() => {
    const combined = [...new Set([...SUGGESTED_TAGS, ...allAvailableTags])]
    return combined.filter(t => !tags.includes(t))
  }, [tags, allAvailableTags])

  const handleSave = () => {
    onSave(file.path, tags)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal tag-manager-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <div className="modal-title">
            <Tag size={18} color="var(--accent-light)" />
            <span>Dokumentum Címkék</span>
          </div>
          <button className="btn-subtle" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div style={{ marginBottom: 14, background: 'var(--bg-elevated)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
            Dokumentum:
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
            {file?.name?.replace('.tex', '')}
          </div>
        </div>

        {/* Aktuális címkék */}
        <div className="form-group">
          <label className="form-label">Hozzárendelt címkék ({tags.length})</label>
          <div className="tags-display-wrap">
            {tags.length === 0 ? (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Még nincsenek címkék rendelve a fájlhoz.</span>
            ) : (
              tags.map(tag => (
                <span key={tag} className="tag-pill active">
                  <span>{tag}</span>
                  <button
                    type="button"
                    className="tag-remove-btn"
                    onClick={() => handleRemoveTag(tag)}
                    title="Címke eltávolítása"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))
            )}
          </div>
        </div>

        {/* Új címke bevitele */}
        <div className="form-group">
          <label className="form-label">Új címke hozzáadása</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              className="form-input"
              value={newTagInput}
              onChange={e => setNewTagInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Új címke neve..."
              style={{ flex: 1 }}
              autoFocus
            />
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => handleAddTag()}
              disabled={!newTagInput.trim()}
              style={{ padding: '0 12px' }}
            >
              <Plus size={14} />
              <span>Hozzáad</span>
            </button>
          </div>
        </div>

        {/* Gyors javaslatok */}
        {availableSuggestions.length > 0 && (
          <div className="form-group" style={{ marginBottom: 18 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}>
              <Sparkles size={12} color="var(--accent-light)" />
              Gyors javaslatok (kattints a felvételhez)
            </label>
            <div className="tag-suggestions-cloud">
              {availableSuggestions.slice(0, 10).map(sug => (
                <button
                  key={sug}
                  type="button"
                  className="tag-suggestion-chip"
                  onClick={() => handleAddTag(sug)}
                >
                  <Plus size={10} />
                  <span>{sug}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Mentés / Mégse gombok */}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Mégse
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            <Check size={14} />
            <span>Címkék mentése</span>
          </button>
        </div>
      </div>
    </div>
  )
}
