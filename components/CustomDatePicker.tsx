'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import styles from './CustomDatePicker.module.css'

interface Props {
  caption: string
  value: string // ISO date string (YYYY-MM-DD)
  onChange: (next: string) => void
  disabled?: boolean
  className?: string
}

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

const WEEKDAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']

const fmt = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

const fmtBr = (iso: string) => {
  if (!iso) return ''
  return iso.split('-').reverse().join('/')
}

function parseIsoDate(iso: string) {
  if (!iso) return null
  const parts = iso.split('-').map(Number)
  if (parts.length < 3) return null
  const [y, m, d] = parts
  return new Date(y, m - 1, d)
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function useOutsideClick<T extends HTMLElement>(handler: () => void) {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    function onMouseDown(ev: MouseEvent) {
      if (!ref.current?.contains(ev.target as Node)) handler()
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [handler])
  return ref
}

const CalendarIcon = () => (
  <svg className={styles.calendarIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="17" rx="2.5" />
    <line x1="8" y1="2.5" x2="8" y2="6.5" />
    <line x1="16" y1="2.5" x2="16" y2="6.5" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
)

export default function CustomDatePicker({ caption, value, onChange, disabled, className }: Props) {
  const [open, setOpen] = useState(false)
  const [openUp, setOpenUp] = useState(false)
  const rootRef = useOutsideClick<HTMLDivElement>(() => setOpen(false))
  const selected = useMemo(() => parseIsoDate(value), [value])
  
  const [viewMonth, setViewMonth] = useState(() => {
    const initial = selected || new Date()
    return new Date(initial.getFullYear(), initial.getMonth(), 1)
  })

  useEffect(() => {
    if (open) {
      const dt = selected || new Date()
      setViewMonth(new Date(dt.getFullYear(), dt.getMonth(), 1))

      if (rootRef.current) {
        const rect = rootRef.current.getBoundingClientRect()
        const spaceBelow = window.innerHeight - rect.bottom
        // Se houver menos de 400px abaixo e mais espaço acima, abre pra cima
        if (spaceBelow < 400 && rect.top > 400) {
          setOpenUp(true)
        } else {
          setOpenUp(false)
        }
      }
    }
  }, [open, selected])

  const days = useMemo(() => {
    const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
    const start = new Date(first)
    start.setDate(first.getDate() - first.getDay())
    const allDays: Date[] = []
    for (let i = 0; i < 42; i++) {
      const date = new Date(start)
      date.setDate(start.getDate() + i)
      allDays.push(date)
    }
    return allDays
  }, [viewMonth])

  const today = useMemo(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }, [])

  function pickDay(date: Date) {
    onChange(fmt(date))
    setOpen(false)
  }

  return (
    <div className={`${styles.wrap} ${className || ''}`} ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''} ${value ? styles.triggerFilled : ''}`}
        onClick={() => setOpen(p => !p)}
      >
        <span className={styles.copy}>
          <span className={styles.caption}>{caption}</span>
          <span className={styles.value}>{value ? fmtBr(value) : 'Selecionar data'}</span>
        </span>
        <CalendarIcon />
      </button>

      {open && (
        <div className={`${styles.popover} ${openUp ? styles.popoverUp : ''}`}>
          <div className={styles.head}>
            <button type="button" className={styles.navBtn} onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}>‹</button>
            <div className={styles.month}>{`${MONTHS_PT[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`}</div>
            <button type="button" className={styles.navBtn} onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}>›</button>
          </div>

          <div className={styles.weekdays}>
            {WEEKDAYS_PT.map(d => <span key={d}>{d}</span>)}
          </div>

          <div className={styles.grid}>
            {days.map(date => {
              const isCurrentMonth = date.getMonth() === viewMonth.getMonth()
              const isSelected = !!selected && sameDay(date, selected)
              const isToday = sameDay(date, today)

              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  className={`${styles.day} ${!isCurrentMonth ? styles.dayMuted : ''} ${isToday ? styles.dayToday : ''} ${isSelected ? styles.daySelected : ''}`}
                  onClick={() => pickDay(date)}
                >
                  <span>{date.getDate()}</span>
                </button>
              )
            })}
          </div>

          <div className={styles.footer}>
            <button type="button" className={styles.footerBtn} onClick={() => pickDay(today)}>Hoje</button>
            <button type="button" className={styles.footerBtn} onClick={() => { onChange(''); setOpen(false); }}>Limpar</button>
          </div>
        </div>
      )}
    </div>
  )
}
