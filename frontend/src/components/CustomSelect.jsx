import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'

export default function CustomSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Válassz...',
  className = '',
  size = 'md', // 'sm' | 'md'
  style = {}
}) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)

  const selectedOption = options.find(o => o.value === value)

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false)
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const handleSelect = (option) => {
    onChange(option.value)
    setIsOpen(false)
  }

  return (
    <div
      ref={containerRef}
      className={`custom-select-container ${size} ${className}`}
      style={style}
    >
      {/* Trigger Button */}
      <button
        type="button"
        className={`custom-select-trigger ${isOpen ? 'open' : ''} ${size}`}
        onClick={() => setIsOpen(v => !v)}
      >
        <div className="custom-select-trigger-content">
          {selectedOption?.icon && (() => {
            const Icon = selectedOption.icon
            return (
              <span className="custom-select-icon">
                <Icon size={size === 'sm' ? 13 : 15} />
              </span>
            )
          })()}
          <span className="custom-select-label">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <ChevronDown
          size={size === 'sm' ? 12 : 14}
          className={`custom-select-chevron ${isOpen ? 'open' : ''}`}
        />
      </button>

      {/* Floating Dropdown Menu */}
      {isOpen && (
        <div className="custom-select-dropdown">
          {options.map((option) => {
            const isSelected = option.value === value
            const Icon = option.icon
            return (
              <div
                key={option.value}
                className={`custom-select-item ${isSelected ? 'selected' : ''}`}
                onClick={() => handleSelect(option)}
              >
                {Icon && (
                  <span className="custom-select-item-icon">
                    <Icon size={15} />
                  </span>
                )}
                <div className="custom-select-item-text">
                  <div className="custom-select-item-label">{option.label}</div>
                  {option.desc && (
                    <div className="custom-select-item-desc">{option.desc}</div>
                  )}
                </div>
                {isSelected && (
                  <Check size={14} className="custom-select-item-check" />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
