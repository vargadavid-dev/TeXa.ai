import { CheckCircle2, AlertTriangle, Info, Undo2 } from 'lucide-react'

export default function Notifications({ items }) {
  return (
    <div className="notif-container">
      {items.map(n => (
        <div key={n.id} className={`notif ${n.type}`}>
          {n.type === 'success' && <CheckCircle2 size={16} />}
          {n.type === 'error' && <AlertTriangle size={16} />}
          {n.type === 'info' && <Info size={16} />}
          <span>{n.message}</span>
          {n.action && (
            <button
              type="button"
              className="notif-action-btn"
              onClick={(e) => {
                e.stopPropagation()
                n.action.onClick?.()
              }}
              title={n.action.title || 'Művelet visszavonása'}
            >
              <Undo2 size={12} />
              <span>{n.action.label || 'Visszavonás'}</span>
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
