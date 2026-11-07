import { useState, useMemo, useEffect } from 'react'
import axios from 'axios'
import {
  Bookmark,
  X,
  Plus,
  Trash2,
  Pencil,
  Check,
  Sparkles,
  FileText,
  Layers,
  ArrowRight,
  Sigma,
  Atom,
  ChevronDown,
  ChevronUp
} from 'lucide-react'

export default function CustomDocTypesModal({
  isOpen,
  onClose,
  customDocTypes = [],
  selectedDocTypeId = null,
  onRefreshCustomDocTypes,
  onSelectCustomDocType,
  initialCustomPrompt = '',
  initialSubject = 'Mindkettő',
  addNotif
}) {
  const [tab, setTab] = useState('list') // 'list' | 'create'
  const [filterSubject, setFilterSubject] = useState('Összes')
  const [editingId, setEditingId] = useState(null)
  const [expandedPrompts, setExpandedPrompts] = useState({})

  // Form mezők
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [subject, setSubject] = useState('Mindkettő')
  const [prompt, setPrompt] = useState('')
  const [saving, setSaving] = useState(false)

  // Amikor megnyílik a modal initialCustomPrompt-tal és nincs még beállítva
  useEffect(() => {
    if (isOpen && initialCustomPrompt && !editingId) {
      if (!prompt) {
        setPrompt(initialCustomPrompt)
      }
    }
  }, [isOpen, initialCustomPrompt, editingId, prompt])

  const handleStartCreate = () => {
    setEditingId(null)
    setName('')
    setDesc('')
    setSubject(initialSubject || 'Mindkettő')
    setPrompt(initialCustomPrompt || '')
    setTab('create')
  }

  const handleStartEdit = (item) => {
    setEditingId(item.id)
    setName(item.name || '')
    setDesc(item.desc || '')
    setSubject(item.subject || 'Mindkettő')
    setPrompt(item.prompt || '')
    setTab('create')
  }

  const handleUseCurrentPrompt = () => {
    if (!initialCustomPrompt.trim()) {
      addNotif?.('Nincs beírt egyéni utasítás az AI panelen.', 'warning')
      return
    }
    setPrompt(initialCustomPrompt.trim())
    if (!name) {
      setName(initialCustomPrompt.trim().slice(0, 30).replace(/[\n\r]+/g, ' '))
    }
    addNotif?.('Az AI asszisztensben lévő egyéni utasítás beolvasva!', 'info')
  }

  const handleSave = async (e) => {
    if (e) e.preventDefault()
    if (!name.trim()) {
      addNotif?.('A típus nevének megadása kötelező!', 'warning')
      return
    }
    if (!prompt.trim()) {
      addNotif?.('Az egyéni utasítás / elvárások megadása kötelező!', 'warning')
      return
    }

    setSaving(true)
    try {
      if (editingId) {
        const res = await axios.put(`/api/custom-doc-types/${editingId}`, {
          name: name.trim(),
          desc: desc.trim(),
          subject,
          prompt: prompt.trim()
        })
        addNotif?.(`"${name.trim()}" dokumentumtípus sikeresen frissítve!`, 'success')
        if (onRefreshCustomDocTypes) await onRefreshCustomDocTypes()
        if (onSelectCustomDocType) onSelectCustomDocType(res.data.docType)
      } else {
        const res = await axios.post('/api/custom-doc-types', {
          name: name.trim(),
          desc: desc.trim(),
          subject,
          prompt: prompt.trim()
        })
        addNotif?.(`"${name.trim()}" saját dokumentumtípus elmentve!`, 'success')
        if (onRefreshCustomDocTypes) await onRefreshCustomDocTypes()
        if (onSelectCustomDocType) onSelectCustomDocType(res.data.docType)
      }
      setTab('list')
      setEditingId(null)
      setName('')
      setDesc('')
      setPrompt('')
    } catch (err) {
      addNotif?.(err.response?.data?.error || err.message || 'Hiba a mentés során', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item) => {
    if (item.isBuiltIn) {
      addNotif?.('A beépített mintasablonok nem törölhetők.', 'warning')
      return
    }
    if (!window.confirm(`Biztosan törölni szeretnéd a(z) "${item.name}" saját dokumentumtípust?`)) {
      return
    }

    try {
      await axios.delete(`/api/custom-doc-types/${item.id}`)
      addNotif?.(`"${item.name}" sikeresen törölve.`, 'info')
      if (onRefreshCustomDocTypes) await onRefreshCustomDocTypes()
    } catch (err) {
      addNotif?.(err.response?.data?.error || err.message || 'Hiba a törlés során', 'error')
    }
  }

  const handleSelect = (item) => {
    if (onSelectCustomDocType) {
      onSelectCustomDocType(item)
    }
    addNotif?.(`"${item.name}" kiválasztva generáláshoz.`, 'info')
    onClose()
  }

  const togglePromptExpand = (id) => {
    setExpandedPrompts((prev) => ({
      ...prev,
      [id]: !prev[id]
    }))
  }

  const filteredList = useMemo(() => {
    if (filterSubject === 'Összes') return customDocTypes
    return customDocTypes.filter(
      (item) => item.subject === filterSubject || item.subject === 'Mindkettő' || !item.subject
    )
  }, [customDocTypes, filterSubject])

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal custom-doc-types-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 740, width: '92%', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Fejléc */}
        <div className="modal-header">
          <div className="modal-title">
            <Bookmark size={17} color="var(--accent-light, #64a8ff)" />
            <span>Saját Dokumentumtípusok & Sablonok</span>
            <span className="sidebar-count-badge">{customDocTypes.length} típus</span>
          </div>
          <button type="button" className="btn-subtle" onClick={onClose} title="Bezárás">
            <X size={16} />
          </button>
        </div>

        {/* Felső fülváltó */}
        <div className="preamble-tabs-bar">
          <div className="preamble-tab-buttons">
            <button
              type="button"
              className={`preamble-tab-btn ${tab === 'list' ? 'active' : ''}`}
              onClick={() => {
                setTab('list')
                setEditingId(null)
              }}
            >
              <FileText size={13} />
              <span>Mentett típusok ({customDocTypes.length})</span>
            </button>
            <button
              type="button"
              className={`preamble-tab-btn ${tab === 'create' ? 'active' : ''}`}
              onClick={handleStartCreate}
            >
              <Plus size={13} />
              <span>{editingId ? 'Típus szerkesztése' : 'Új típus rögzítése'}</span>
            </button>
          </div>

          {tab === 'create' && initialCustomPrompt && (
            <button
              type="button"
              className="btn-subtle"
              onClick={handleUseCurrentPrompt}
              style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px' }}
              title="Az AI panelbe beírt egyéni utasítás azonnali betöltése ide"
            >
              <Sparkles size={12} color="var(--accent-light)" />
              <span>AI panel utasítás átvétele</span>
            </button>
          )}
        </div>

        {/* TARTALOM: Lista nézet */}
        {tab === 'list' && (
          <div className="preamble-list-container" style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
            {/* Tantárgy szűrő egységes sáv */}
            <div className="custom-doc-filter-wrap">
              <span className="custom-doc-filter-label">Szűrés tantárgy szerint:</span>
              <div className="custom-doc-filter-track">
                {[
                  { id: 'Összes', label: 'Összes', icon: null },
                  { id: 'Matematika', label: 'Matematika', icon: Sigma },
                  { id: 'Fizika', label: 'Fizika', icon: Atom },
                  { id: 'Mindkettő', label: 'Mindkettő', icon: Layers }
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    type="button"
                    key={id}
                    className={`custom-doc-filter-btn ${filterSubject === id ? 'active' : ''}`}
                    onClick={() => setFilterSubject(id)}
                  >
                    {Icon && <Icon size={12} />}
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {filteredList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                <Bookmark size={32} style={{ opacity: 0.35, margin: '0 auto 12px' }} />
                <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-secondary)' }}>
                  Nincs megjeleníthető dokumentumtípus ebben a szűrésben.
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ marginTop: 14, marginInline: 'auto', height: 32, fontSize: 12 }}
                  onClick={handleStartCreate}
                >
                  <Plus size={13} />
                  <span>Új saját típus létrehozása</span>
                </button>
              </div>
            ) : (
              <div className="custom-doc-list">
                {filteredList.map((item) => {
                  const isSelected = selectedDocTypeId === item.id
                  const isExpanded = Boolean(expandedPrompts[item.id])

                  return (
                    <div
                      key={item.id}
                      className={`custom-doc-card ${isSelected ? 'active-doc' : ''}`}
                    >
                      <div className="custom-doc-card-header">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="custom-doc-title-row">
                            <span className="custom-doc-name">{item.name}</span>
                            <div className="custom-doc-badges">
                              {item.isBuiltIn ? (
                                <span className="custom-doc-badge builtin">Mintasablon</span>
                              ) : (
                                <span className="custom-doc-badge custom">Saját mentett</span>
                              )}
                              <span className="custom-doc-badge subject">
                                {item.subject === 'Matematika' && <Sigma size={11} />}
                                {item.subject === 'Fizika' && <Atom size={11} />}
                                {(!item.subject || item.subject === 'Mindkettő') && <Layers size={11} />}
                                <span>{item.subject || 'Mindkettő'}</span>
                              </span>
                              {isSelected && (
                                <span className="custom-doc-badge active-indicator">Aktív</span>
                              )}
                            </div>
                          </div>
                          {item.desc && (
                            <div className="custom-doc-desc" style={{ marginTop: 4 }}>
                              {item.desc}
                            </div>
                          )}
                        </div>

                        {/* Akciógombok */}
                        <div className="custom-doc-actions">
                          <button
                            type="button"
                            className={`doc-action-btn select-btn ${isSelected ? 'is-active' : ''}`}
                            onClick={() => !isSelected && handleSelect(item)}
                            title={
                              isSelected
                                ? 'Jelenleg ez a sablon van kiválasztva generáláshoz'
                                : 'Sablon kiválasztása generáláshoz'
                            }
                          >
                            <Check size={12} />
                            <span>{isSelected ? 'Kiválasztva' : 'Kiválasztás'}</span>
                          </button>

                          <button
                            type="button"
                            className="doc-action-icon-btn"
                            onClick={() => handleStartEdit(item)}
                            title="Típus és utasítás szerkesztése"
                          >
                            <Pencil size={12} />
                          </button>

                          {!item.isBuiltIn && (
                            <button
                              type="button"
                              className="doc-action-icon-btn delete-btn"
                              onClick={() => handleDelete(item)}
                              title="Típus törlése"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* AI Utasítás Előnézet Kártya */}
                      {item.prompt && (
                        <div className="custom-doc-prompt-box">
                          <div className="custom-doc-prompt-header">
                            <span className="custom-doc-prompt-label">
                              <Sparkles size={10.5} color="var(--accent-light, #64a8ff)" />
                              AI utasítás & felépítés
                            </span>
                            {item.prompt.length > 100 && (
                              <button
                                type="button"
                                className="custom-doc-prompt-toggle"
                                onClick={() => togglePromptExpand(item.id)}
                              >
                                <span>{isExpanded ? 'Összecsukás' : 'Részletek'}</span>
                                {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                              </button>
                            )}
                          </div>
                          <div className={`custom-doc-prompt-text ${!isExpanded ? 'collapsed' : ''}`}>
                            {item.prompt}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* TARTALOM: Új létrehozása / Szerkesztés */}
        {tab === 'create' && (
          <form
            onSubmit={handleSave}
            style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 14 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Típus neve *</label>
                <input
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="pl. Képletgyűjtemény, Laboratóriumi jegyzőkönyv, Tézislap…"
                  autoFocus
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tantárgy</label>
                <select
                  className="form-input"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  style={{ cursor: 'pointer' }}
                >
                  <option value="Mindkettő">Mindkettő</option>
                  <option value="Matematika">Matematika</option>
                  <option value="Fizika">Fizika</option>
                </select>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Rövid leírás (opcionális)</label>
              <input
                type="text"
                className="form-input"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="pl. 2 hasábos, tömör összefoglaló tételekkel és táblázatokkal"
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label className="form-label" style={{ marginBottom: 0 }}>
                  Egyéni utasítás / Sablon elvárások az AI felé *
                </label>
                {initialCustomPrompt && (
                  <button
                    type="button"
                    className="btn-text-subtle"
                    onClick={handleUseCurrentPrompt}
                    title="Az AI panelbe beírt aktuális szöveg átmásolása"
                    style={{ fontSize: 11 }}
                  >
                    + AI panel szöveg átvétele
                  </button>
                )}
              </div>
              <textarea
                className="form-textarea"
                style={{
                  flex: 1,
                  minHeight: 180,
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: 12,
                  lineHeight: 1.5
                }}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={`Írd le részletesen, hogy az AI milyen struktúrában, milyen fejezetekkel, dobozokkal és stílusban generálja le ezt a dokumentumtípust...\n\nPéldául:\n- 2 oszlopos multicols elrendezés\n- Tömör definíciók tcolorbox-ban\n- Táblázatok booktabs csomaggal\n- Minden összefüggés mellett SI mértékegységek`}
              />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                paddingTop: 12,
                borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.08))'
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setTab('list')
                  setEditingId(null)
                }}
              >
                Mégse
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving || !name.trim() || !prompt.trim()}
              >
                {saving ? (
                  <span>Mentés...</span>
                ) : (
                  <>
                    <Check size={13} />
                    <span>{editingId ? 'Módosítások mentése' : 'Saját típus mentése'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
