import { CheckCircle2, Sparkles, X, Undo2, Check, Info } from 'lucide-react'

export default function StructureFixModal({ result, onClose, onRevert }) {
  if (!result) return null

  const hasChanges = result.hasChanges !== false
  const summaryList = Array.isArray(result.summary) && result.summary.length > 0
    ? result.summary
    : ['A dokumentum fejezethierarchiája és számozásai sikeresen átnézve és javítva a TOC alapján.']

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal structure-fix-modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 520, width: '92%' }}
      >
        <div className="modal-header">
          <div className="modal-title">
            <Sparkles size={18} color="var(--accent-light)" />
            <span>TOC és Dokumentum Szerkezet Javítása</span>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            title="Bezárás"
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {hasChanges ? (
            <>
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '12px 14px',
                borderRadius: 'var(--radius-md, 8px)',
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                fontSize: 12.5,
                color: 'var(--text-secondary)',
                lineHeight: 1.5
              }}>
                <Sparkles size={16} color="var(--accent-light)" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <strong style={{ color: 'var(--text-primary)' }}>
                    A dokumentum hierarchiája és számozásai sikeresen javítva!
                  </strong>
                  <div style={{ marginTop: 2 }}>
                    A kód azonnal bekerült a szerkesztőbe, a szerkezeti fa (TOC) frissült, és a PDF fordítás automatikusan elindult.
                  </div>
                </div>
              </div>

              <div>
                <div style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  color: 'var(--text-secondary)',
                  marginBottom: 8
                }}>
                  Végrehajtott korrekciók:
                </div>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  maxHeight: 220,
                  overflowY: 'auto',
                  paddingRight: 4
                }}>
                  {summaryList.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        padding: '8px 10px',
                        borderRadius: 6,
                        background: 'rgba(255, 255, 255, 0.025)',
                        border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.06))',
                        fontSize: 12.5,
                        color: 'var(--text-primary)'
                      }}
                    >
                      <CheckCircle2 size={15} color="var(--success, #10b981)" style={{ flexShrink: 0, marginTop: 1 }} />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '14px',
              borderRadius: 'var(--radius-md, 8px)',
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              fontSize: 13,
              color: 'var(--text-secondary)',
              lineHeight: 1.5
            }}>
              <CheckCircle2 size={18} color="var(--success, #10b981)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>
                  A dokumentum szerkezete és számozása már tökéletes!
                </strong>
                <div style={{ marginTop: 3 }}>
                  A fejezetek, szakaszok és alcímek szintezése már eleve logikus összhangban van a tartalomjegyzékkel (TOC), kettős számozás nem található.
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {hasChanges && onRevert && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onRevert}
              title="Visszaállítás az átnézés előtti kódra"
              style={{ gap: 6 }}
            >
              <Undo2 size={13} />
              <span>Visszavonás az előző kódra</span>
            </button>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={onClose}
            style={{ gap: 6 }}
          >
            <Check size={14} />
            <span>{hasChanges ? 'Rendben, megtartom' : 'Bezárás'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
