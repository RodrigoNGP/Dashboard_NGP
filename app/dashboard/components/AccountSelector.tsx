import React, { useState, useRef, useEffect } from 'react'
import { Cliente } from '@/types'
import styles from '../dashboard.module.css'

interface AccountSelectorProps {
  clients: Cliente[]
  viewing: { account: string; name: string; id: string } | null
  onSelect: (c: Cliente) => void
}

export default function AccountSelector({ clients, viewing, onSelect }: AccountSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleDown)
    return () => document.removeEventListener('mousedown', handleDown)
  }, [open])

  const filtered = clients.filter(c => 
    c.nome.toLowerCase().includes(search.toLowerCase()) || 
    (c.meta_account_id || '').includes(search)
  ).sort((a, b) => a.nome.localeCompare(b.nome))

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button 
        onClick={() => setOpen(!open)}
        className={styles.workspaceSidebarSecondaryBtn}
        style={{ height: 38, padding: '0 15px', gap: 8 }}
      >
        <span>Alterar conta</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width={14} height={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}><path d="m6 9 6 6 6-6"/></svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100,
          background: '#fff', border: '1.5px solid #E5E5EA', borderRadius: 14,
          boxShadow: '0 12px 40px rgba(0,0,0,0.15)', width: 280,
          maxHeight: 400, display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}>
          <div style={{ padding: 12, borderBottom: '1px solid #F5F5F7' }}>
            <input 
              autoFocus
              className={styles.tableSearch} 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              placeholder="Buscar conta..." 
              style={{ width: '100%', margin: 0 }}
            />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
            {filtered.map(c => (
              <button
                key={c.id}
                onClick={() => { onSelect(c); setOpen(false) }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', border: 'none', background: viewing?.id === c.id ? '#F2F2F7' : 'transparent',
                  textAlign: 'left', cursor: 'pointer', transition: 'background .1s',
                  fontFamily: 'inherit'
                }}
                onMouseEnter={e => { if (viewing?.id !== c.id) (e.currentTarget as HTMLButtonElement).style.background = '#F9F9FB' }}
                onMouseLeave={e => { if (viewing?.id !== c.id) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                <div style={{ 
                  width: 32, height: 32, borderRadius: 8, background: 'var(--report-primary)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0
                }}>
                  {c.nome.slice(0, 2).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome}</div>
                  <div style={{ fontSize: 11, color: '#8E8E93', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.meta_account_id || 'Sem conta'}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
