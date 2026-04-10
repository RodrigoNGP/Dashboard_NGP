'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from '@/lib/auth'
import Sidebar from '@/components/Sidebar'
import styles from './pessoas.module.css'

export default function PessoasPage() {
  const router = useRouter()
  const [sess, setSess] = useState<ReturnType<typeof getSession> | null>(null)

  useEffect(() => {
    const s = getSession()
    if (!s || s.auth !== '1') { router.replace('/login'); return }
    if (s.role !== 'ngp')     { router.replace('/cliente'); return }
    setSess(s)
  }, [router])

  if (!sess) return null

  return (
    <div className={styles.layout}>
      <Sidebar showDashboardNav={false} />

      <main className={styles.main}>
        <div className={styles.content}>
          <header className={styles.header}>
            <button className={styles.btnBack} onClick={() => router.push('/setores')}>
              ← Setores
            </button>
            <div className={styles.eyebrow}>Setor</div>
            <h1 className={styles.title}>Pessoas</h1>
            <p className={styles.subtitle}>Gestão de equipe, colaboradores, onboarding e cultura NGP.</p>
          </header>

          <div className={styles.comingSoon}>
            <div className={styles.comingSoonIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87"/>
                <path d="M16 3.13a4 4 0 010 7.75"/>
              </svg>
            </div>
            <h2 className={styles.comingSoonTitle}>Em construção</h2>
            <p className={styles.comingSoonDesc}>
              As funcionalidades do setor Pessoas estão sendo desenvolvidas.<br/>
              Em breve disponível para a equipe NGP.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
