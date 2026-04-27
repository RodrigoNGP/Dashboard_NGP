'use client'
import React, { useState, useRef, useEffect } from 'react'
import styles from './CustomSelect.module.css'

export interface SelectOption {
  id: string
  label: string
  subLabel?: string
  icon?: React.ReactNode
  image?: string
}

interface CustomSelectProps {
  label?: string
  caption?: string
  value: string
  options: SelectOption[]
  onChange: (id: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export default function CustomSelect({ label, caption, value, options, onChange, placeholder = 'Selecionar...', className, disabled }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [openUp, setOpenUp] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const selectedOption = options.find(o => o.id === value)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      // Se houver menos de 300px abaixo e houver mais espaço acima, abre pra cima
      if (spaceBelow < 300 && rect.top > 300) {
        setOpenUp(true)
      } else {
        setOpenUp(false)
      }
    }
  }, [isOpen])

  return (
    <div className={`${styles.container} ${className || ''}`} ref={containerRef}>
      {label && <label className={styles.label}>{label}</label>}
      <button
        type="button"
        className={`${styles.trigger} ${isOpen ? styles.triggerOpen : ''} ${disabled ? styles.triggerDisabled : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <div className={styles.triggerCopy}>
          {caption && <span className={styles.caption}>{caption}</span>}
          <span className={styles.value}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <svg className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div className={`${styles.menu} ${openUp ? styles.menuUp : ''}`}>
          {options.map(option => {
            const isActive = option.id === value
            return (
              <button
                key={option.id}
                type="button"
                className={`${styles.option} ${isActive ? styles.optionActive : ''}`}
                onClick={() => {
                  onChange(option.id)
                  setIsOpen(false)
                }}
              >
                {option.image && <img src={option.image} alt="" className={styles.optionImage} />}
                {option.icon && <span className={styles.optionIcon}>{option.icon}</span>}
                <div className={styles.optionInfo}>
                  <div className={styles.optionLabel}>{option.label}</div>
                  {option.subLabel && <div className={styles.optionSubLabel}>{option.subLabel}</div>}
                </div>
                {isActive && <span className={styles.checkmark}>✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
