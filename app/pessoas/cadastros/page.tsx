'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { SURL } from '@/lib/constants'
import { efHeaders } from '@/lib/api'
import Sidebar from '@/components/Sidebar'
import styles from './cadastros.module.css'

interface CadastroItem {
  id: string
  tipo: 'cargo' | 'funcao' | 'senioridade'
  nome: string
  ativo: boolean
  created_at: string
  updated_at: string
}

interface CadastrosResponse {
  cargos: CadastroItem[]
  funcoes: CadastroItem[]
  senioridades: CadastroItem[]
}

const IcoRelogio = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={15} height={15}>
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
)

const IcoTabela = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={15} height={15}>
    <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/>
    <line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/>
  </svg>
)

const IcoCarreira = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={15} height={15}>
    <path d="M12 20h9"/><path d="M12 4h9"/><path d="M4 9h16"/><path d="M4 15h16"/><path d="M8 4v16"/>
  </svg>
)

const IcoLixeira = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={15} height={15}>
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
  </svg>
)

const EMPTY_CADASTROS: CadastrosResponse = { cargos: [], funcoes: [], senioridades: [] }

const IcoDelete = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
  </svg>
)

export default function PessoasCadastrosPage() {
  const router = useRouter()
  const [sess, setSess] = useState<ReturnType<typeof getSession> | null>(null)
  const [cadastros, setCadastros] = useState<CadastrosResponse>(EMPTY_CADASTROS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<'cargo' | 'funcao' | 'senioridade' | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [cargoNome, setCargoNome] = useState('')
  const [funcaoNome, setFuncaoNome] = useState('')
  const [senioridadeNome, setSenioridadeNome] = useState('')
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    const s = getSession()
    if (!s || s.auth !== '1') { router.replace('/login'); return }
    if (s.role !== 'admin') { router.replace('/pessoas'); return }
    setSess(s)
  }, [router])

  const showMsg = useCallback((type: 'ok' | 'err', text: string) => {
    setMsg({ type, text })
    window.setTimeout(() => setMsg(null), 4500)
  }, [])

  const fetchCadastros = useCallback(async () => {
    const s = getSession()
    if (!s) return
    setLoading(true)
    try {
      const res = await fetch(`${SURL}/functions/v1/admin-carreira-cadastros`, {
        method: 'POST',
        headers: efHeaders(),
        body: JSON.stringify({ session_token: s.session }),
      })
      const data = await res.json()
      if (data.error) {
        showMsg('err', data.error)
        return
      }
      setCadastros({
        cargos: data.cargos || [],
        funcoes: data.funcoes || [],
        senioridades: data.senioridades || [],
      })
    } catch {
      showMsg('err', 'Erro ao carregar cadastros.')
    } finally {
      setLoading(false)
    }
  }, [showMsg])

  useEffect(() => {
    if (sess) fetchCadastros()
  }, [sess, fetchCadastros])

  const saveCadastro = async (tipo: 'cargo' | 'funcao' | 'senioridade', nome: string, reset: () => void) => {
    const s = getSession()
    if (!s || !nome.trim()) return
    setSaving(tipo)
    try {
      const res = await fetch(`${SURL}/functions/v1/admin-carreira-upsert-cadastro`, {
        method: 'POST',
        headers: efHeaders(),
        body: JSON.stringify({ session_token: s.session, tipo, nome }),
      })
      const data = await res.json()
      if (data.error) {
        showMsg('err', data.error)
        return
      }
      reset()
      showMsg('ok', 'Cadastro salvo com sucesso.')
      await fetchCadastros()
    } catch {
      showMsg('err', 'Erro ao salvar cadastro.')
    } finally {
      setSaving(null)
    }
  }

  const deleteCadastro = async (item: CadastroItem) => {
    const s = getSession()
    if (!s) return
    if (!confirm(`Excluir "${item.nome}" de ${item.tipo}?`)) return

    setDeletingId(item.id)
    try {
      const res = await fetch(`${SURL}/functions/v1/admin-carreira-delete-cadastro`, {
        method: 'POST',
        headers: efHeaders(),
        body: JSON.stringify({ session_token: s.session, id: item.id }),
      })
      const data = await res.json()
      if (data.error) {
        showMsg('err', data.error)
        return
      }
      setCadastros((current) => ({
        cargos: current.cargos.filter((cadastro) => cadastro.id !== item.id),
        funcoes: current.funcoes.filter((cadastro) => cadastro.id !== item.id),
        senioridades: current.senioridades.filter((cadastro) => cadastro.id !== item.id),
      }))
      showMsg('ok', 'Cadastro excluído com sucesso.')
    } catch {
      showMsg('err', 'Erro ao excluir cadastro.')
    } finally {
      setDeletingId(null)
    }
  }

  if (!sess) return null

  const sectorNav = [
    { icon: <IcoRelogio />, label: 'Dashboard', href: '/pessoas' },
    { icon: <IcoTabela />, label: 'Registros de Ponto', href: '/pessoas/registros' },
    { icon: <IcoCarreira />, label: 'Colaboradores', href: '/pessoas/carreira' },
    { icon: <IcoTabela />, label: 'Cadastros', href: '/pessoas/cadastros' },
    { icon: <IcoLixeira />, label: 'Lixeira', href: '/pessoas/lixeira' },
  ]

  return (
    <div className={styles.layout}>
      <Sidebar showDashboardNav={false} minimal sectorNav={sectorNav} sectorNavTitle="PESSOAS" />
      <main className={styles.main}>
        <div className={styles.content}>
          <header className={styles.header}>
            <button className={styles.btnBack} onClick={() => router.push('/pessoas')}>
              ← Pessoas
            </button>
            <div className={styles.eyebrow}>Setor · Pessoas · Admin</div>
            <h1 className={styles.title}>Cadastros</h1>
            <p className={styles.subtitle}>Cadastre cargos, funções e senioridades fixas para usar no perfil dos colaboradores.</p>
          </header>

          {msg && (
            <div className={`${styles.msgBar} ${msg.type === 'ok' ? styles.msgOk : styles.msgErr}`}>
              {msg.text}
            </div>
          )}

          <section className={styles.grid}>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>Cargos</h2>
                <span className={styles.panelHint}>{cadastros.cargos.length} cadastrados</span>
              </div>
              <form className={styles.form} onSubmit={(e) => { e.preventDefault(); saveCadastro('cargo', cargoNome, () => setCargoNome('')) }}>
                <input value={cargoNome} onChange={(e) => setCargoNome(e.target.value)} placeholder="Ex: Analista de Performance" />
                <button type="submit" disabled={saving === 'cargo'}>{saving === 'cargo' ? 'Salvando...' : 'Cadastrar cargo'}</button>
              </form>
              <div className={styles.list}>
                {loading ? <div className={styles.empty}>Carregando...</div> : cadastros.cargos.length ? cadastros.cargos.map((item) => (
                  <div key={item.id} className={styles.item}>
                    <span>{item.nome}</span>
                    <button type="button" className={styles.btnDelete} onClick={() => deleteCadastro(item)} disabled={deletingId === item.id}>
                      <IcoDelete />
                    </button>
                  </div>
                )) : <div className={styles.empty}>Nenhum cargo cadastrado.</div>}
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>Funções</h2>
                <span className={styles.panelHint}>{cadastros.funcoes.length} cadastradas</span>
              </div>
              <form className={styles.form} onSubmit={(e) => { e.preventDefault(); saveCadastro('funcao', funcaoNome, () => setFuncaoNome('')) }}>
                <input value={funcaoNome} onChange={(e) => setFuncaoNome(e.target.value)} placeholder="Ex: Operação de mídia" />
                <button type="submit" disabled={saving === 'funcao'}>{saving === 'funcao' ? 'Salvando...' : 'Cadastrar função'}</button>
              </form>
              <div className={styles.list}>
                {loading ? <div className={styles.empty}>Carregando...</div> : cadastros.funcoes.length ? cadastros.funcoes.map((item) => (
                  <div key={item.id} className={styles.item}>
                    <span>{item.nome}</span>
                    <button type="button" className={styles.btnDelete} onClick={() => deleteCadastro(item)} disabled={deletingId === item.id}>
                      <IcoDelete />
                    </button>
                  </div>
                )) : <div className={styles.empty}>Nenhuma função cadastrada.</div>}
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>Senioridades</h2>
                <span className={styles.panelHint}>{cadastros.senioridades.length} cadastradas</span>
              </div>
              <form className={styles.form} onSubmit={(e) => { e.preventDefault(); saveCadastro('senioridade', senioridadeNome, () => setSenioridadeNome('')) }}>
                <input value={senioridadeNome} onChange={(e) => setSenioridadeNome(e.target.value)} placeholder="Ex: Júnior" />
                <button type="submit" disabled={saving === 'senioridade'}>{saving === 'senioridade' ? 'Salvando...' : 'Cadastrar senioridade'}</button>
              </form>
              <div className={styles.list}>
                {loading ? <div className={styles.empty}>Carregando...</div> : cadastros.senioridades.length ? cadastros.senioridades.map((item) => (
                  <div key={item.id} className={styles.item}>
                    <span>{item.nome}</span>
                    <button type="button" className={styles.btnDelete} onClick={() => deleteCadastro(item)} disabled={deletingId === item.id}>
                      <IcoDelete />
                    </button>
                  </div>
                )) : <div className={styles.empty}>Nenhuma senioridade cadastrada.</div>}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
