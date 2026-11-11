import { useState, useMemo, useEffect } from 'react'
import axios from 'axios'
import {
  GraduationCap,
  X,
  Plus,
  Trash2,
  Edit2,
  Check,
  Sparkles,
  FileText,
  Clock,
  Layers,
  CheckSquare
} from 'lucide-react'

export default function ExamTemplatesModal({
  isOpen,
  onClose,
  examTemplates = [],
  onRefreshExamTemplates,
  onSelectExamTemplate,
  currentExamConfig = {},
  addNotif
}) {
  const [tab, setTab] = useState('list') // 'list' | 'create'
  const [editingId, setEditingId] = useState(null)

  // Form mezők
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [examType, setExamType] = useState('temazaro')
  const [taskCount, setTaskCount] = useState(5)
  const [groupMode, setGroupMode] = useState('ab') // 'none' | 'ab' | 'abc' | 'abcd'
  const [withGroupsAB, setWithGroupsAB] = useState(true)
  const [layoutMode, setLayoutMode] = useState('compact')
  const [withEvaluationTable, setWithEvaluationTable] = useState(true)
  const [withRubric, setWithRubric] = useState(true)
  const [withGradingScale, setWithGradingScale] = useState(true)
  const [solutionPlacement, setSolutionPlacement] = useState('separate_page')
  const [customPrompt, setCustomPrompt] = useState('')
  const [saving, setSaving] = useState(false)

  const handleStartCreate = () => {
    setEditingId(null)
    setName('')
    setDesc('')
    setExamType(currentExamConfig.examType || 'temazaro')
    setTaskCount(currentExamConfig.taskCount || 5)
    const gm = currentExamConfig.groupMode || (currentExamConfig.withGroupsAB ? 'ab' : 'none')
    setGroupMode(gm)
    setWithGroupsAB(gm !== 'none')
    setLayoutMode(currentExamConfig.layoutMode || 'compact')
    setWithEvaluationTable(currentExamConfig.withEvaluationTable !== undefined ? currentExamConfig.withEvaluationTable : true)
    setWithRubric(currentExamConfig.withRubric !== undefined ? currentExamConfig.withRubric : true)
    setWithGradingScale(currentExamConfig.withGradingScale !== undefined ? currentExamConfig.withGradingScale : true)
    setSolutionPlacement(currentExamConfig.solutionPlacement || 'separate_page')
    setCustomPrompt(currentExamConfig.customPrompt || '')
    setTab('create')
  }

  const handleStartEdit = (tpl) => {
    setEditingId(tpl.id)
    setName(tpl.name || '')
    setDesc(tpl.desc || '')
    setExamType(tpl.examType || 'temazaro')
    setTaskCount(tpl.taskCount || 5)
    const gm = tpl.groupMode || (tpl.withGroupsAB ? 'ab' : 'none')
    setGroupMode(gm)
    setWithGroupsAB(gm !== 'none')
    setLayoutMode(tpl.layoutMode || 'compact')
    setWithEvaluationTable(tpl.withEvaluationTable !== undefined ? tpl.withEvaluationTable : true)
    setWithRubric(tpl.withRubric !== undefined ? tpl.withRubric : true)
    setWithGradingScale(tpl.withGradingScale !== undefined ? tpl.withGradingScale : true)
    setSolutionPlacement(tpl.solutionPlacement || 'separate_page')
    setCustomPrompt(tpl.customPrompt || '')
    setTab('create')
  }

  const handleAdoptCurrentSettings = () => {
    setExamType(currentExamConfig.examType || 'temazaro')
    setTaskCount(currentExamConfig.taskCount || 5)
    const gm = currentExamConfig.groupMode || (currentExamConfig.withGroupsAB ? 'ab' : 'none')
    setGroupMode(gm)
    setWithGroupsAB(gm !== 'none')
    setLayoutMode(currentExamConfig.layoutMode || 'compact')
    setWithEvaluationTable(currentExamConfig.withEvaluationTable !== undefined ? currentExamConfig.withEvaluationTable : true)
    setWithRubric(currentExamConfig.withRubric !== undefined ? currentExamConfig.withRubric : true)
    setWithGradingScale(currentExamConfig.withGradingScale !== undefined ? currentExamConfig.withGradingScale : true)
    setSolutionPlacement(currentExamConfig.solutionPlacement || 'separate_page')
    setCustomPrompt(currentExamConfig.customPrompt || '')
    if (!name && currentExamConfig.topic) {
      setName(`${currentExamConfig.topic} dolgozat`)
    }
    addNotif?.('A jelenlegi dolgozat beállítások átvéve a szerkesztőbe!', 'info')
  }

  const handleSave = async (e) => {
    if (e) e.preventDefault()
    if (!name.trim()) {
      addNotif?.('A sablon nevének megadása kötelező!', 'warning')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        desc: desc.trim(),
        examType,
        taskCount: Number(taskCount) || 5,
        groupMode,
        withGroupsAB: groupMode !== 'none',
        layoutMode,
        withEvaluationTable,
        withRubric,
        withGradingScale,
        solutionPlacement,
        customPrompt: customPrompt.trim()
      }

      if (editingId) {
        const res = await axios.put(`/api/exam-templates/${editingId}`, payload)
        addNotif?.(`"${name.trim()}" dolgozatsablon sikeresen frissítve!`, 'success')
        if (onRefreshExamTemplates) await onRefreshExamTemplates()
        if (onSelectExamTemplate) onSelectExamTemplate(res.data.template)
      } else {
        const res = await axios.post('/api/exam-templates', payload)
        addNotif?.(`"${name.trim()}" saját dolgozatsablon elmentve!`, 'success')
        if (onRefreshExamTemplates) await onRefreshExamTemplates()
        if (onSelectExamTemplate) onSelectExamTemplate(res.data.template)
      }
      setTab('list')
      setEditingId(null)
    } catch (err) {
      addNotif?.(err.response?.data?.error || err.message || 'Hiba a mentés során', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (tpl) => {
    if (tpl.isBuiltIn) {
      addNotif?.('A beépített mintasablonok nem törölhetők.', 'warning')
      return
    }
    if (!window.confirm(`Biztosan törölni szeretnéd a(z) "${tpl.name}" dolgozatsablont?`)) {
      return
    }

    try {
      await axios.delete(`/api/exam-templates/${tpl.id}`)
      addNotif?.(`"${tpl.name}" sablon sikeresen törölve.`, 'info')
      if (onRefreshExamTemplates) await onRefreshExamTemplates()
    } catch (err) {
      addNotif?.(err.response?.data?.error || err.message || 'Hiba a törlés során', 'error')
    }
  }

  const handleSelect = (tpl) => {
    if (onSelectExamTemplate) {
      onSelectExamTemplate(tpl)
    }
    addNotif?.(`"${tpl.name}" sablon betöltve.`, 'info')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal preamble-modal exam-templates-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 760, width: '92%', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Fejléc */}
        <div className="modal-header">
          <div className="modal-title">
            <GraduationCap size={18} color="var(--accent)" />
            <span>Dolgozatsablonok Kezelése</span>
            <span className="sidebar-count-badge">{examTemplates.length} sablon</span>
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
              <span>Mentett sablonok ({examTemplates.length})</span>
            </button>
            <button
              type="button"
              className={`preamble-tab-btn ${tab === 'create' ? 'active' : ''}`}
              onClick={handleStartCreate}
            >
              <Plus size={13} />
              <span>{editingId ? 'Sablon szerkesztése' : 'Új saját sablon mentése'}</span>
            </button>
          </div>

          {tab === 'create' && (
            <button
              type="button"
              className="btn-subtle"
              onClick={handleAdoptCurrentSettings}
              style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px' }}
              title="A jelenlegi dolgozat fülön beállított paraméterek beemelése"
            >
              <Sparkles size={12} color="var(--accent-light)" />
              <span>Jelenlegi beállítások átvétele</span>
            </button>
          )}
        </div>

        {/* TARTALOM: Lista nézet */}
        {tab === 'list' && (
          <div className="preamble-list-container" style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {examTemplates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="preamble-card"
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
                    borderRadius: 8,
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    transition: 'border-color 0.15s, background 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-bright, #fff)' }}>
                          {tpl.name}
                        </span>
                        {tpl.isBuiltIn ? (
                          <span
                            style={{
                              fontSize: 10.5,
                              padding: '2px 7px',
                              borderRadius: 10,
                              background: 'rgba(56, 189, 248, 0.14)',
                              color: 'var(--accent-light, #38bdf8)',
                              fontWeight: 500
                            }}
                          >
                            Alapértelmezett sablon
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: 10.5,
                              padding: '2px 7px',
                              borderRadius: 10,
                              background: 'rgba(168, 85, 247, 0.14)',
                              color: '#c084fc',
                              fontWeight: 500
                            }}
                          >
                            Saját sablon
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: 10.5,
                            padding: '2px 7px',
                            borderRadius: 10,
                            background: 'rgba(255, 255, 255, 0.07)',
                            color: 'var(--text-muted)'
                          }}
                        >
                          {tpl.taskCount} feladat · {tpl.groupMode === 'abcd' ? 'A/B/C/D csoport' : tpl.groupMode === 'abc' ? 'A/B/C csoport' : tpl.withGroupsAB || tpl.groupMode === 'ab' ? 'A/B csoport' : 'Egységes'} · {tpl.layoutMode === 'worksheet' ? 'Munkalap (rácsos)' : 'Kompakt'}
                        </span>
                      </div>
                      {tpl.desc && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                          {tpl.desc}
                        </div>
                      )}
                    </div>

                    {/* Műveleti gombok */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ height: 28, padding: '0 10px', fontSize: 11.5 }}
                        onClick={() => handleSelect(tpl)}
                        title="Sablon betöltése a dolgozat fülre"
                      >
                        <Check size={12} />
                        <span>Betöltés</span>
                      </button>

                      <button
                        type="button"
                        className="btn-icon"
                        style={{ height: 28, width: 28 }}
                        onClick={() => handleStartEdit(tpl)}
                        title="Sablon beállításainak szerkesztése"
                      >
                        <Edit2 size={13} />
                      </button>

                      {!tpl.isBuiltIn && (
                        <button
                          type="button"
                          className="btn-icon"
                          style={{ height: 28, width: 28, color: 'var(--danger, #ef4444)' }}
                          onClick={() => handleDelete(tpl)}
                          title="Sablon törlése"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {tpl.customPrompt && (
                    <div
                      style={{
                        background: 'rgba(0, 0, 0, 0.25)',
                        borderRadius: 6,
                        padding: '6px 10px',
                        fontSize: 11,
                        color: 'var(--text-subtle, #94a3b8)',
                        whiteSpace: 'pre-wrap',
                        border: '1px solid rgba(255,255,255,0.04)'
                      }}
                    >
                      {tpl.customPrompt}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TARTALOM: Új sablon mentése / Szerkesztés */}
        {tab === 'create' && (
          <form
            onSubmit={handleSave}
            style={{ padding: '16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Sablon neve *</label>
                <input
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="pl. 10. évfolyam Témazáró sablon, Kétheti röpdolgozat…"
                  autoFocus
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Dolgozat jellege / típusa</label>
                <select
                  className="form-input"
                  value={examType}
                  onChange={(e) => setExamType(e.target.value)}
                  style={{ cursor: 'pointer' }}
                >
                  <option value="ropdolgozat">⚡️ Röpdolgozat (15 perc)</option>
                  <option value="dolgozat">📝 Órai dolgozat / Ellenőrző (30 perc)</option>
                  <option value="temazaro">📘 Témazáró dolgozat (45 perc)</option>
                  <option value="erettsegi">🎓 Érettségi próbavizsga (90 perc)</option>
                  <option value="custom">✍️ Egyedi dolgozat</option>
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
                placeholder="pl. 4 feladatos órai dolgozat A/B csoporttal és fejléc értékelő táblázattal"
              />
            </div>

            {/* Paraméterek rács */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, background: 'rgba(255,255,255,0.02)', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Feladatok száma</label>
                <input
                  type="number"
                  min="2"
                  max="15"
                  className="form-input"
                  value={taskCount}
                  onChange={(e) => setTaskCount(Math.max(2, Math.min(15, Number(e.target.value) || 5)))}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Csoportok bontása</label>
                <select
                  className="form-input"
                  value={groupMode}
                  onChange={(e) => {
                    const gm = e.target.value
                    setGroupMode(gm)
                    setWithGroupsAB(gm !== 'none')
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <option value="ab">„A” és „B” csoport (2 változat)</option>
                  <option value="abc">„A”, „B” és „C” csoport (3 változat)</option>
                  <option value="abcd">„A”, „B”, „C” és „D” csoport (4 változat)</option>
                  <option value="none">Egyetlen csoport (Egységes)</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Elrendezés</label>
                <select
                  className="form-input"
                  value={layoutMode}
                  onChange={(e) => setLayoutMode(e.target.value)}
                  style={{ cursor: 'pointer' }}
                >
                  <option value="compact">Kompakt feladatlap</option>
                  <option value="worksheet">Kitöltős munkalap (négyzethálós)</option>
                </select>
              </div>
            </div>

            {/* Checkbox opciók */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={withEvaluationTable}
                  onChange={(e) => setWithEvaluationTable(e.target.checked)}
                />
                <span>Fejléc táblázat (Max pont, elért pont, érdemjegy)</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={withRubric}
                  onChange={(e) => setWithRubric(e.target.checked)}
                />
                <span>Pontozási rubrika (részpontok [X pont])</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={withGradingScale}
                  onChange={(e) => setWithGradingScale(e.target.checked)}
                />
                <span>Érdemjegy ponthatárok táblázat (1–5)</span>
              </label>
            </div>

            {/* Sablonhoz tartozó egyéni utasítás */}
            <div className="form-group" style={{ marginBottom: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <label className="form-label">
                Alapértelmezett instrukciók az AI felé ehhez a sablonhoz (opcionális)
              </label>
              <textarea
                className="form-textarea"
                style={{ flex: 1, minHeight: 90, fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5 }}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="pl. K1 alapismeretek (1-2. feladat), K2 típusfeladatok (3-4. feladat), K3 összetett feladat (5. feladat). Összesen 45-50 pont."
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.08))' }}>
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
                disabled={saving || !name.trim()}
              >
                {saving ? (
                  <span>Mentés...</span>
                ) : (
                  <>
                    <Check size={13} />
                    <span>{editingId ? 'Módosítások mentése' : 'Sablon mentése'}</span>
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
