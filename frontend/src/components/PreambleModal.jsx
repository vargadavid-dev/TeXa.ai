import { useState, useMemo } from 'react'
import axios from 'axios'
import {
  Layers,
  X,
  Plus,
  Trash2,
  Check,
  Copy,
  Sparkles,
  Sigma,
  Atom,
  FileCode,
  ArrowRight,
  Code2
} from 'lucide-react'

export default function PreambleModal({
  isOpen,
  onClose,
  preambles = [],
  onRefreshPreambles,
  currentCode,
  onApplyPreambleToEditor,
  addNotif
}) {
  const [tab, setTab] = useState('list') // 'list' | 'create'
  const [filterSubject, setFilterSubject] = useState('Összes')
  const [copiedId, setCopiedId] = useState(null)

  // Új preambulum form mezők
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [subject, setSubject] = useState('Mindkettő')
  const [preambleCode, setPreambleCode] = useState('')
  const [saving, setSaving] = useState(false)

  // Jelenlegi kód preambulumának kinyerése
  const extractCurrentPreamble = () => {
    if (!currentCode) return ''
    const idx = currentCode.indexOf('\\begin{document}')
    if (idx !== -1) {
      return currentCode.slice(0, idx).trim()
    }
    return currentCode.trim()
  }

  const handleUseCurrentCode = () => {
    const extracted = extractCurrentPreamble()
    if (!extracted) {
      addNotif('A szerkesztőben nem található érvényes preambulum.', 'warning')
      return
    }
    setPreambleCode(extracted)
    if (!name) setName('Saját mentett preambulum')
    if (!desc) setDesc('A szerkesztőből beolvasott egyéni csomagok és stílusok')
    setTab('create')
    addNotif('A jelenlegi dokumentum preambuluma beolvasva a szerkesztőbe!', 'info')
  }

  const handleSupplementCurrentPreamble = async () => {
    if (!preambleCode.trim()) {
      addNotif('Előbb adj meg vagy olvass be egy preambulumot!', 'warning')
      return
    }
    try {
      const res = await axios.post('/api/preambles/supplement', {
        preamble: preambleCode,
        body: currentCode
      })
      setPreambleCode(res.data.preamble)
      const addedList = res.data.added || []
      if (addedList.length > 0) {
        addNotif(`Megjelenítéshez kiegészített csomagok: ${addedList.slice(0, 5).join(', ')}${addedList.length > 5 ? '...' : ''}`, 'success')
      } else {
        addNotif('A preambulum már tartalmazza a legfontosabb megjelenítési csomagokat!', 'info')
      }
    } catch {
      addNotif('Hiba történt a csomagok kiegészítése során.', 'error')
    }
  }

  const handleSave = async () => {
    if (!name.trim()) {
      addNotif('Kérlek adj meg egy nevet a preambulumnak!', 'warning')
      return
    }
    if (!preambleCode.trim()) {
      addNotif('A preambulum kódja nem lehet üres!', 'warning')
      return
    }

    setSaving(true)
    try {
      await axios.post('/api/preambles', {
        name: name.trim(),
        desc: desc.trim(),
        subject,
        preamble: preambleCode.trim()
      })
      addNotif(`"${name.trim()}" preambulum sikeresen elmentve!`, 'success')
      setName('')
      setDesc('')
      setPreambleCode('')
      setTab('list')
      if (onRefreshPreambles) onRefreshPreambles()
    } catch (err) {
      addNotif(err.response?.data?.error || err.message || 'Hiba a mentés során', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (p) => {
    if (p.isBuiltin) return
    if (!window.confirm(`Biztosan törölni szeretnéd a(z) "${p.name}" preambulumot?`)) return

    try {
      await axios.delete(`/api/preambles/${p.id}`)
      addNotif(`"${p.name}" sikeresen törölve.`, 'info')
      if (onRefreshPreambles) onRefreshPreambles()
    } catch (err) {
      addNotif(err.response?.data?.error || err.message || 'Hiba a törlés során', 'error')
    }
  }

  const handleCopyCode = (p) => {
    navigator.clipboard.writeText(p.preamble)
    setCopiedId(p.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const filteredPreambles = useMemo(() => {
    if (filterSubject === 'Összes') return preambles
    return preambles.filter((p) => p.subject === filterSubject || p.subject === 'Mindkettő')
  }, [preambles, filterSubject])

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal preamble-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 760, width: '92%', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Fejléc */}
        <div className="modal-header">
          <div className="modal-title">
            <Layers size={18} color="var(--accent)" />
            <span>Preambulumok & Sablonok Kezelése</span>
            <span className="sidebar-count-badge">{preambles.length} sablon</span>
          </div>
          <button className="btn-subtle" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Felső fülváltó */}
        <div className="preamble-tabs-bar">
          <div className="preamble-tab-buttons">
            <button
              className={`preamble-tab-btn ${tab === 'list' ? 'active' : ''}`}
              onClick={() => setTab('list')}
            >
              <FileCode size={13} />
              <span>Mentett Preambulumok ({preambles.length})</span>
            </button>
            <button
              className={`preamble-tab-btn ${tab === 'create' ? 'active' : ''}`}
              onClick={() => setTab('create')}
            >
              <Plus size={13} />
              <span>Új Saját Preambulum</span>
            </button>
          </div>

          <button
            className="btn-subtle"
            onClick={handleUseCurrentCode}
            style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px' }}
            title="A jelenlegi szerkesztőben lévő preambulum azonnali beolvasása"
          >
            <Sparkles size={12} color="var(--accent-light)" />
            <span>Jelenlegi kód beolvasása</span>
          </button>
        </div>

        {/* TARTALOM: Lista nézet */}
        {tab === 'list' && (
          <div className="preamble-list-container">
            {/* Szűrő tantárgy szerint */}
            <div className="preamble-filter-row">
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Szűrés tantárgy szerint:</span>
              <div className="preamble-filter-chips">
                {['Összes', 'Matematika', 'Fizika', 'Mindkettő'].map((sub) => (
                  <button
                    key={sub}
                    className={`preamble-filter-chip ${filterSubject === sub ? 'active' : ''}`}
                    onClick={() => setFilterSubject(sub)}
                  >
                    {sub}
                  </button>
                ))}
              </div>
            </div>

            <div className="preambles-cards-scroll">
              {filteredPreambles.map((p) => {
                const isCustom = !p.isBuiltin
                return (
                  <div key={p.id} className="preamble-card">
                    <div className="preamble-card-header">
                      <div className="preamble-card-title-wrap">
                        <div className="preamble-card-name">{p.name}</div>
                        <div className="preamble-card-badges">
                          <span className={`preamble-tag ${isCustom ? 'custom' : 'builtin'}`}>
                            {isCustom ? 'Saját sablon' : 'Alapértelmezett'}
                          </span>
                          <span className="preamble-tag subject">
                            {p.subject === 'Matematika' && <Sigma size={11} />}
                            {p.subject === 'Fizika' && <Atom size={11} />}
                            {p.subject}
                          </span>
                        </div>
                      </div>

                      <div className="preamble-card-actions">
                        <button
                          className="btn-subtle"
                          onClick={() => handleCopyCode(p)}
                          title="Preambulum kódjának másolása"
                          style={{ padding: '3px 7px' }}
                        >
                          {copiedId === p.id ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
                        </button>
                        {isCustom && (
                          <button
                            className="btn-subtle"
                            onClick={() => handleDelete(p)}
                            title="Saját sablon törlése"
                            style={{ padding: '3px 7px', color: 'var(--error)' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                        {onApplyPreambleToEditor && (
                          <button
                            className="btn btn-primary"
                            onClick={() => {
                              onApplyPreambleToEditor(p)
                              onClose()
                            }}
                            style={{ fontSize: 11, padding: '3px 10px', height: 26 }}
                            title="Alkalmazás a most nyitva lévő dokumentum elején"
                          >
                            <span>Alkalmazás</span>
                            <ArrowRight size={11} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="preamble-card-desc">{p.desc}</div>

                    <div className="preamble-code-preview">
                      <pre>{p.preamble.slice(0, 320)}{p.preamble.length > 320 ? '...' : ''}</pre>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* TARTALOM: Új Preambulum Létrehozása Form */}
        {tab === 'create' && (
          <div className="preamble-create-container">
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label className="form-label">Preambulum neve *</label>
              <input
                className="form-input"
                placeholder="pl. Emelt szintű Matek Érettségi Sablon"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tantárgy</label>
                <div className="subject-switcher" style={{ width: '100%' }}>
                  {['Matematika', 'Fizika', 'Mindkettő'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`subject-btn ${subject === s ? 'active' : ''}`}
                      onClick={() => setSubject(s)}
                      style={{ flex: 1, justifyContent: 'center', padding: '6px 8px', fontSize: 11.5 }}
                    >
                      {s === 'Matematika' && <Sigma size={13} />}
                      {s === 'Fizika' && <Atom size={13} />}
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Rövid leírás (opcionális)</label>
                <input
                  className="form-input"
                  placeholder="pl. 2cm margó, kék kiemelések, siunitx"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label className="form-label" style={{ marginBottom: 0 }}>
                  LaTeX Preambulum kód (\\documentclass-tól \\begin&#123;document&#125; előtti sorig) *
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    type="button"
                    className="btn-subtle"
                    onClick={handleSupplementCurrentPreamble}
                    style={{ fontSize: 11, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--accent-light)' }}
                    title="Kiegészítés a megjelenítéshez szükséges csomagokkal (tcolorbox, TikZ, pgfplots, amsmath, stb.)"
                  >
                    <Sparkles size={11} />
                    <span>Csomagok kiegészítése a megjelenítéshez</span>
                  </button>
                  <button
                    type="button"
                    className="btn-subtle"
                    onClick={handleUseCurrentCode}
                    style={{ fontSize: 11, padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <Code2 size={11} />
                    <span>Kód beolvasása szerkesztőből</span>
                  </button>
                </div>
              </div>

              <textarea
                className="form-input preamble-textarea"
                style={{
                  flex: 1,
                  minHeight: 180,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12,
                  lineHeight: 1.5,
                  resize: 'vertical'
                }}
                placeholder={`\\documentclass[a4paper,12pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[magyar]{babel}
\\usepackage{amsmath, amssymb}
\\usepackage{geometry}
\\geometry{margin=2.5cm}`}
                value={preambleCode}
                onChange={(e) => setPreambleCode(e.target.value)}
              />
            </div>

            <div className="modal-actions" style={{ paddingTop: 8 }}>
              <button className="btn btn-ghost" onClick={() => setTab('list')}>
                Vissza a listához
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving || !name.trim() || !preambleCode.trim()}
              >
                <Plus size={14} />
                <span>{saving ? 'Mentés folyamatban...' : 'Preambulum Mentése'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
