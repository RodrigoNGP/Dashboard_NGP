'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { setSession, getSession } from '@/lib/auth'
import { SURL, ANON } from '@/lib/constants'
import styles from './login.module.css'

// Componente interno isolado — useSearchParams exige Suspense no Next.js 13+
function LoginContent() {
  const router = useRouter()
  const params = useSearchParams()
  const [mounted, setMounted] = useState(false)
  const [tab, setTab] = useState<'cliente' | 'ngp'>('cliente')
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('Verificando...')

  useEffect(() => {
    const sess = getSession()
    if (sess?.auth === '1') {
      router.replace(sess.role === 'ngp' ? '/dashboard' : '/cliente')
      return
    }
    setMounted(true)
  }, [router])

  async function doLogin() {
    if (!user || !pass) { setError('Preencha todos os campos.'); return }
    setLoading(true); setError('')
    try {
      console.log('[login] Attempting login with username:', user, 'role:', tab)

      const res = await fetch(`${SURL}/functions/v1/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON },
        body: JSON.stringify({ username: user.trim().toLowerCase(), password: pass, role: tab }),
      })

      console.log('[login] Response status:', res.status, 'ok:', res.ok)
      const data = await res.json()
      console.log('[login] Response data:', data)

      if (!res.ok || data.error) {
        console.log('[login] Login failed:', data.error)
        setError(data.error || 'Erro ao fazer login.');
        setLoading(false);
        return
      }

      console.log('[login] Login successful, preparing session data')
      const sessionData = {
        auth:        '1',
        session:     data.session_token,
        user:        data.user.nome,
        role:        data.user.role,
        username:    data.user.username,
        expires:     data.expires_at,
        metaAccount: data.user.meta_account_id,
        foto:        data.user.foto_url,
      }
      console.log('[login] Session data object:', sessionData)

      setSession(sessionData)
      console.log('[login] setSession() called')
      console.log('[login] Verifying sessionStorage after setSession:')
      console.log('  adsboard_auth:', sessionStorage.getItem('adsboard_auth'))
      console.log('  adsboard_session:', sessionStorage.getItem('adsboard_session'))
      console.log('  adsboard_user:', sessionStorage.getItem('adsboard_user'))
      console.log('  adsboard_role:', sessionStorage.getItem('adsboard_role'))

      setLoadingMsg(`Bem-vindo, ${data.user.nome}!`)
      const returnUrl = params.get('returnUrl')
      const redirectTo = returnUrl ? decodeURIComponent(returnUrl) : data.user.role === 'ngp' ? '/dashboard' : '/cliente'
      console.log('[login] Redirecting to:', redirectTo)

      setTimeout(() => {
        console.log('[login] Executing redirect after 900ms')
        router.replace(redirectTo)
      }, 900)
    } catch (e: unknown) {
      console.error('[login] Exception:', e)
      setError('Erro de conexão: ' + (e instanceof Error ? e.message : 'Tente novamente.'))
      setLoading(false)
    }
  }

  if (!mounted) return null

  return (
    <>
      {loading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.spinner} />
          <p>{loadingMsg}</p>
        </div>
      )}
      <div className={styles.wrap}>
        <div className={styles.logoArea}>
          <div className={styles.logoMark}>
            <svg viewBox="0 0 24 24" fill="white" width={26} height={26}>
              <path d="M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm14 3a4 4 0 110-8 4 4 0 010 8z"/>
            </svg>
          </div>
          <div className={styles.logoText}>NGP <span>Dashboard</span></div>
          <div className={styles.logoSub}>Plataforma de gestão de campanhas</div>
        </div>

        <div className={styles.tabs}>
          <button className={`${styles.tabBtn} ${tab === 'cliente' ? styles.active : ''}`} onClick={() => { setTab('cliente'); setError('') }}>
            👤 Cliente
          </button>
          <button className={`${styles.tabBtn} ${tab === 'ngp' ? styles.active : ''}`} onClick={() => { setTab('ngp'); setError('') }}>
            🚀 NGP
          </button>
        </div>

        <div className={styles.card}>
          <div className={`${styles.badge} ${tab === 'cliente' ? styles.badgeC : styles.badgeN}`}>
            {tab === 'cliente' ? '👤 Área do Cliente' : '🚀 Área NGP'}
          </div>
          {error && <div className={styles.err}>{error}</div>}
          <div className={styles.field}>
            <label>Usuário</label>
            <input type="text" placeholder="Seu usuário" value={user} onChange={e => setUser(e.target.value)} onKeyDown={e => e.key === 'Enter' && doLogin()} />
          </div>
          <div className={styles.field}>
            <label>Senha</label>
            <input type="password" placeholder="Sua senha" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && doLogin()} />
          </div>
          <button className={styles.btnLogin} onClick={doLogin} disabled={loading}>
            {loading ? 'Aguarde...' : 'Entrar'}
          </button>
          <p className={styles.hint}>
            {tab === 'cliente' ? 'Acesso restrito a clientes autorizados' : 'Acesso exclusivo equipe NGP'}
          </p>
        </div>

        <div className={styles.dbBadge}>
          <span className={styles.dbDot} />
          Conectado ao Supabase
        </div>
      </div>
    </>
  )
}

// Suspense obrigatório para useSearchParams no Next.js 13+
export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }} />}>
      <LoginContent />
    </Suspense>
  )
}
