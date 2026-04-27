'use client'
import React from 'react'
import styles from '../dashboard.module.css'

interface AdPreviewModalProps {
  html: string | null
  loading: boolean
  adName: string
  onClose: () => void
}

export default function AdPreviewModal({ html, loading, adName, onClose }: AdPreviewModalProps) {
  if (!html && !loading) return null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 500, height: 'min(750px, 90vh)', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E5EA', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#111', letterSpacing: '-0.01em' }}>Preview do Criativo</div>
            <div style={{ fontSize: 11, color: '#AEAEB2', marginTop: 1, fontWeight: 500 }}>{adName}</div>
          </div>
          <button 
            onClick={onClose}
            style={{ background: '#F5F5F7', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6E6E73', transition: 'all 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#E5E5EA')}
            onMouseLeave={e => (e.currentTarget.style.background = '#F5F5F7')}
          >✕</button>
        </div>
        <div style={{ flex: 1, position: 'relative', background: '#F5F5F7', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <div className={styles.spinner} style={{ width: 32, height: 32 }} />
              <span style={{ fontSize: 13, color: '#111', fontWeight: 700 }}>Gerando preview oficial...</span>
              <span style={{ fontSize: 11, color: '#AEAEB2' }}>Isso pode levar alguns segundos</span>
            </div>
          ) : (
            <iframe 
              srcDoc={html || ''} 
              style={{ width: '100%', height: '100%', border: 'none' }}
              title="Meta Ad Preview"
            />
          )}
        </div>
        <div style={{ padding: '16px 20px', borderTop: '1px solid #E5E5EA', background: '#fff', display: 'flex', justifyContent: 'flex-end' }}>
          <button 
            onClick={onClose}
            style={{ padding: '10px 24px', fontSize: 13, fontWeight: 700, background: '#111', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer' }}
          >Fechar</button>
        </div>
      </div>
    </div>
  )
}
