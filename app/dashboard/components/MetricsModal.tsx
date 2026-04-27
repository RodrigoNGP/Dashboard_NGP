'use client'
import React from 'react'
import styles from '../dashboard.module.css'
import { META_METRICS } from '@/lib/meta-metrics'

interface MetricsModalProps {
  visible: string[]
  onToggle: (id: string) => void
  onReset: () => void
  onClose: () => void
}

export default function MetricsModal({ visible, onToggle, onReset, onClose }: MetricsModalProps) {
  return (
    <div className={styles.modal} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, height: 'min(700px, 90vh)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E5EA', background: '#fff' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#111', letterSpacing: '-0.02em', marginBottom: 2 }}>Personalizar Métricas</div>
          <p style={{ fontSize: 12, color: '#AEAEB2', fontWeight: 500 }}>Selecione o que é mais importante para o seu cliente.</p>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {META_METRICS.map(m => (
              <div 
                key={m.id} 
                onClick={() => onToggle(m.id)}
                style={{ 
                  padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${visible.includes(m.id) ? 'var(--report-primary)' : '#F5F5F7'}`,
                  background: visible.includes(m.id) ? `${'var(--report-primary)'}08` : '#fff',
                  cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 10
                }}
              >
                <div style={{ 
                  width: 18, height: 18, borderRadius: 5, border: '2px solid',
                  borderColor: visible.includes(m.id) ? 'var(--report-primary)' : '#E5E5EA',
                  background: visible.includes(m.id) ? 'var(--report-primary)' : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s'
                }}>
                  {visible.includes(m.id) && <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" width={10} height={10}><path d="M20 6L9 17L4 12"/></svg>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: visible.includes(m.id) ? '#111' : '#6E6E73' }}>{m.label}</div>
                  {m.apiField && <div style={{ fontSize: 9, color: '#AEAEB2', fontFamily: "'JetBrains Mono',monospace" }}>{m.apiField}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #E5E5EA', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FAFAFA' }}>
          <div style={{ fontSize: 12, color: '#6E6E73', fontWeight: 600 }}>{visible.length} ativas</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onReset} style={{ background: 'none', border: 'none', fontSize: 12, fontWeight: 600, color: '#6E6E73', cursor: 'pointer' }}>Restaurar padrão</button>
            <button onClick={onClose} style={{ background: 'var(--report-primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Aplicar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
