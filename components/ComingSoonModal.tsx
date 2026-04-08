'use client'
import { useEffect } from 'react'
import styles from './ComingSoonModal.module.css'

interface Props {
  /** Nome do setor a exibir. Quando null/undefined, o modal não aparece. */
  setor: string | null
  onClose: () => void
}

export default function ComingSoonModal({ setor, onClose }: Props) {
  // Fechar com Esc
  useEffect(() => {
    if (!setor) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setor, onClose])

  if (!setor) return null

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className={styles.close} onClick={onClose} aria-label="Fechar">×</button>
        <div className={styles.icon}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
        <h2 className={styles.title}>Em breve na NGP</h2>
        <p className={styles.desc}>
          O setor <strong>{setor}</strong> está em desenvolvimento.<br/>
          Em breve estará disponível por aqui.
        </p>
        <button className={styles.btn} onClick={onClose}>
          Entendi
        </button>
      </div>
    </div>
  )
}
