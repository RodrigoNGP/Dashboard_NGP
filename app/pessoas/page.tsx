'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { SURL } from '@/lib/constants'
import { efHeaders } from '@/lib/api'
import Sidebar from '@/components/Sidebar'
import NGPLoading from '@/components/NGPLoading'
import CustomSelect from '@/components/CustomSelect'
import styles from './pessoas.module.css'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PontoRecord {
  id: string
  tipo_registro: 'entrada' | 'saida_almoco' | 'retorno_almoco' | 'saida' | 'extra_entrada' | 'extra_saida' | 'extra'
  created_at: string
  usuario_id?: string
  usuario_nome?: string
}

interface ExtraPair {
  entrada: string | null
  saida: string | null
}

interface DayRow {
  uniqueKey: string
  dateStr: string
  dateLabel: string
  entrada: string | null
  saidaAlmoco: string | null
  retornoAlmoco: string | null
  saida: string | null
  extras: ExtraPair[]
  totalMins: number
  extrasMins: number
  status: 'complete' | 'overtime' | 'below' | 'incomplete' | 'empty'
  recordIds: string[]
  usuarioId?: string
  usuarioNome?: string
}

interface NextAction {
  tipo: string
  label: string
  color: string
}

interface DashboardDistribution {
  label: string
  count: number
}

interface PeopleDashboardData {
  cards: {
    total_colaboradores: number
    total_horas_semana_mins: number
    total_horas_mes_mins: number
    total_funcoes: number
  }
  distribuicoes: {
    por_funcao: DashboardDistribution[]
    por_cargo: DashboardDistribution[]
    por_senioridade: DashboardDistribution[]
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

const BRT_OFFSET = -3 * 60 * 60 * 1000

function toLocalTime(utcIso: string): string {
  const ms = new Date(utcIso).getTime() + BRT_OFFSET
  const d  = new Date(ms)
  const h  = d.getUTCHours().toString().padStart(2, '0')
  const m  = d.getUTCMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

function fmtMins(mins: number): string {
  if (mins <= 0) return '--'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}h${m.toString().padStart(2, '00')}m`
}

function calcBalance(records: PontoRecord[]): { totalMins: number; status: DayRow['status']; extrasMins: number } {
  const sorted = [...records].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const ms = (iso: string) => new Date(iso).getTime()
  
  let totalMs = 0
  
  // Logic: Pair any entry-type with its immediate next exit-type
  // Entries: entrada, retorno_almoco, extra_entrada
  // Exits: saida_almoco, saida, extra_saida
  const isEntry = (t: string) => ['entrada', 'retorno_almoco', 'extra_entrada'].includes(t)
  const isExit = (t: string) => ['saida_almoco', 'saida', 'extra_saida'].includes(t)

  let entryTime: number | null = null

  for (const r of sorted) {
    if (isEntry(r.tipo_registro)) {
      entryTime = ms(r.created_at)
    } else if (isExit(r.tipo_registro) && entryTime) {
      totalMs += (ms(r.created_at) - entryTime)
      entryTime = null
    }
  }

  const totalMins = Math.floor(totalMs / 60000)
  
  // Determine TARGET based on day of week (compensation for Saturdays)
  // Seg-Qui: 9h (540m), Sex: 8h (480m)
  const firstRec = records[0]
  const date = firstRec ? new Date(new Date(firstRec.created_at).getTime() + BRT_OFFSET) : new Date()
  const dayOfWeek = date.getUTCDay() // 0=Dom, 1=Seg, ..., 5=Sex, 6=Sáb
  
  let TARGET = 8 * 60
  if (dayOfWeek >= 1 && dayOfWeek <= 4) { // Seg a Qui
    TARGET = 9 * 60
  } else if (dayOfWeek === 5) { // Sex
    TARGET = 8 * 60
  } else if (dayOfWeek === 6 || dayOfWeek === 0) { // Fim de semana (se houver registro, meta é 0 ou 8? User não especificou, mantemos 8 ou 0?)
    // Se registrou no fds, geralmente tudo é extra ou segue meta de 8h. 
    // Vamos manter 8h como padrão seguro, mas o foco é Seg-Qui = 9h.
    TARGET = 8 * 60 
  }

  const diffMins = totalMins - TARGET
  const extrasMins = diffMins > 0 ? diffMins : 0

  const hasEntrada = records.some(r => r.tipo_registro === 'entrada')
  const hasSaida   = records.some(r => r.tipo_registro === 'saida')

  if (!hasEntrada) return { totalMins: 0, status: 'empty', extrasMins: 0 }

  let status: DayRow['status']
  if (!hasSaida) status = 'incomplete'
  else if (diffMins > 0)             status = 'overtime'
  else if (diffMins >= -5)           status = 'complete'
  else                               status = 'below'

  return { totalMins, status, extrasMins }
}

const DAYS   = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function groupByDay(records: PontoRecord[]): DayRow[] {
  // Group by user + date so admin sees each user's day separately
  const groups: Record<string, PontoRecord[]> = {}
  for (const r of records) {
    const dateStr = new Date(new Date(r.created_at).getTime() + BRT_OFFSET)
      .toISOString().split('T')[0]
    const key = `${r.usuario_id || 'self'}__${dateStr}`
    if (!groups[key]) groups[key] = []
    groups[key].push(r)
  }

  return Object.entries(groups)
    .sort(([a], [b]) => {
      // Sort by date desc, then by user
      const [, dateA] = a.split('__')
      const [, dateB] = b.split('__')
      return dateB.localeCompare(dateA) || a.localeCompare(b)
    })
    .map(([key, dayRecords]) => {
      dayRecords.sort((a, b) => a.created_at.localeCompare(b.created_at))
      const get = (t: string) => dayRecords.find(r => r.tipo_registro === t)
      const { totalMins, status, extrasMins } = calcBalance(dayRecords)

      const [, dateStr] = key.split('__')
      const [y, mo, d] = dateStr.split('-').map(Number)
      const dateObj = new Date(Date.UTC(y, mo - 1, d, 12))
      const dayLabel = `${DAYS[dateObj.getUTCDay()]}, ${d} ${MONTHS[mo - 1]}`

      const firstRec = dayRecords[0]
      const usuarioNome = firstRec.usuario_nome || undefined

      // Agrupa extras em pares (entrada → saída)
      const extraEntradas = dayRecords.filter(r => r.tipo_registro === 'extra_entrada')
      const extraSaidas   = dayRecords.filter(r => r.tipo_registro === 'extra_saida')
      const extras: ExtraPair[] = []
      const maxPairs = Math.max(extraEntradas.length, extraSaidas.length)
      for (let i = 0; i < maxPairs; i++) {
        extras.push({
          entrada: extraEntradas[i] ? toLocalTime(extraEntradas[i].created_at) : null,
          saida:   extraSaidas[i]   ? toLocalTime(extraSaidas[i].created_at)   : null,
        })
      }

      return {
        uniqueKey: key,
        dateStr,
        dateLabel:    dayLabel,
        entrada:      get('entrada')        ? toLocalTime(get('entrada')!.created_at)        : null,
        saidaAlmoco:  get('saida_almoco')   ? toLocalTime(get('saida_almoco')!.created_at)   : null,
        retornoAlmoco:get('retorno_almoco') ? toLocalTime(get('retorno_almoco')!.created_at) : null,
        saida:        get('saida')          ? toLocalTime(get('saida')!.created_at)          : null,
        extras,
        totalMins,
        extrasMins,
        status,
        recordIds: dayRecords.map(r => r.id),
        usuarioId: firstRec.usuario_id,
        usuarioNome,
      }
    })
}

function getNextAction(records: PontoRecord[]): NextAction | null {
  if (records.length === 0) return { tipo: 'entrada', label: 'Registrar Entrada', color: '#059669' }
  const last = records[records.length - 1].tipo_registro
  const map: Record<string, NextAction> = {
    entrada:        { tipo: 'saida_almoco',   label: 'Saída para Almoço', color: '#f59e0b' },
    saida_almoco:   { tipo: 'retorno_almoco', label: 'Retorno do Almoço', color: '#3b82f6' },
    retorno_almoco: { tipo: 'saida',          label: 'Registrar Saída',   color: '#9B1540' },
    saida:          { tipo: 'extra_entrada',  label: 'Entrada Extra',     color: '#7c3aed' },
    extra_entrada:  { tipo: 'extra_saida',    label: 'Saída Extra',       color: '#6d28d9' },
    extra_saida:    { tipo: 'extra_entrada',  label: 'Entrada Extra',     color: '#7c3aed' },
    extra:          { tipo: 'extra_entrada',  label: 'Entrada Extra',     color: '#7c3aed' },
  }
  return map[last] ?? null
}

const STATUS_LABEL: Record<string, string> = {
  complete:   'Completo',
  overtime:   'Hora extra',
  below:      'Abaixo da carga',
  incomplete: 'Em andamento',
  empty:      '—',
}
const STATUS_COLOR: Record<string, string> = {
  complete:   '#059669',
  overtime:   '#3b82f6',
  below:      '#dc2626',
  incomplete: '#f59e0b',
  empty:      '#8E8E93',
}

const TIPO_LABEL: Record<string, string> = {
  entrada:        'Entrada',
  saida_almoco:   'Saída Almoço',
  retorno_almoco: 'Retorno Almoço',
  saida:          'Saída',
  extra_entrada:  'Entrada Extra',
  extra_saida:    'Saída Extra',
  extra:          'Extra',
}


// ── Ícones inline ─────────────────────────────────────────────────────────────

const IcoRelogio = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" width={15} height={15}>
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
)

const IcoLixeira = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" width={15} height={15}>
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
  </svg>
)

const IcoCarreira = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" width={15} height={15}>
    <path d="M12 20h9"/>
    <path d="M12 4h9"/>
    <path d="M4 9h16"/>
    <path d="M4 15h16"/>
    <path d="M8 4v16"/>
  </svg>
)

const IcoTrash = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
  </svg>
)

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PessoasPage() {
  const router = useRouter()
  const [sess, setSess] = useState<ReturnType<typeof getSession> | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  // Relógio
  const offsetRef = useRef<number>(0)
  const [clockDisplay, setClockDisplay] = useState('--:--:--')

  // Ponto do dia
  const [todayRecords, setTodayRecords] = useState<PontoRecord[]>([])
  const [loadingPonto, setLoadingPonto] = useState(false)
  const [pontoMsg, setPontoMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Registros mensais
  const [mesRecords, setMesRecords] = useState<PontoRecord[]>([])
  const [loadingMes, setLoadingMes] = useState(false)

  // Filtro mês/ano
  const nowDate = new Date()
  const [selMes, setSelMes] = useState(nowDate.getMonth() + 1)
  const [selAno, setSelAno] = useState(nowDate.getFullYear())

  // Delete
  const [deletingRow, setDeletingRow] = useState<string | null>(null)

  // Admin: visualizar todos os usuários
  const [viewAll, setViewAll] = useState(true)
  const [dashboardData, setDashboardData] = useState<PeopleDashboardData | null>(null)
  const [loadingDashboard, setLoadingDashboard] = useState(false)

  // Auth
  useEffect(() => {
    const s = getSession()
    if (!s || s.auth !== '1') { router.replace('/login'); return }
    if (s.role !== 'ngp' && s.role !== 'admin') { router.replace('/cliente'); return }
    setSess(s)
  }, [router])

  // Verifica se é admin pelo role da sessão local
  const checkAdmin = useCallback(async (): Promise<boolean> => {
    const s = getSession()
    if (!s) return false
    const admin = s.role === 'admin'
    setIsAdmin(admin)
    return admin
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchToday = useCallback(async () => {
    const s = getSession()
    if (!s) return
    try {
      const res  = await fetch(`${SURL}/functions/v1/get-ponto-now`, {
        method: 'POST', headers: efHeaders(),
        body: JSON.stringify({ session_token: s.session }),
      })
      const data = await res.json()
      if (data.error) return
      
      const serverDate = new Date(data.server_now)
      if (!isNaN(serverDate.getTime())) {
        // Calcula o offset entre o servidor e a máquina local
        offsetRef.current = serverDate.getTime() - Date.now()
      }
      setTodayRecords(data.today_records || [])
    } catch { /* silencioso */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchDashboard = useCallback(async () => {
    const s = getSession()
    if (!s || s.role !== 'admin') return
    setLoadingDashboard(true)
    try {
      const res = await fetch(`${SURL}/functions/v1/admin-carreira-dashboard`, {
        method: 'POST',
        headers: efHeaders(),
        body: JSON.stringify({ session_token: s.session }),
      })
      const data = await res.json()
      if (!data.error) setDashboardData(data)
    } catch {
      // silencioso
    } finally {
      setLoadingDashboard(false)
    }
  }, [])

  const fetchMes = useCallback(async (mes: number, ano: number, adminMode?: boolean) => {
    const s = getSession()
    if (!s) return
    setLoadingMes(true)
    try {
      const res  = await fetch(`${SURL}/functions/v1/get-ponto-mes`, {
        method: 'POST', headers: efHeaders(),
        body: JSON.stringify({ session_token: s.session, mes, ano, admin_all: adminMode ?? false }),
      })
      const data = await res.json()
      if (!data.error) setMesRecords(data.records || [])
    } catch { /* silencioso */ } finally {
      setLoadingMes(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sess) return
    fetchToday()
    checkAdmin().then((admin) => fetchMes(selMes, selAno, admin && viewAll))
  }, [sess]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (sess?.role === 'admin') fetchDashboard()
  }, [sess, fetchDashboard])

  useEffect(() => {
    if (!sess) return
    fetchMes(selMes, selAno, isAdmin && viewAll)
  }, [selMes, selAno, viewAll, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  // Success animation state
  const [showSuccess, setShowSuccess] = useState(false)

  // Tick do relógio
  useEffect(() => {
    const interval = setInterval(() => {
      // Sempre calcula baseado no Date.now() atual + offset do servidor
      // Isso evita que o relógio atrase se a aba for suspensa pelo navegador
      const nowMs = Date.now() + offsetRef.current
      const brtMs = nowMs + BRT_OFFSET
      const brt   = new Date(brtMs)
      
      const h     = brt.getUTCHours().toString().padStart(2, '0')
      const m     = brt.getUTCMinutes().toString().padStart(2, '0')
      const sc    = brt.getUTCSeconds().toString().padStart(2, '0')
      setClockDisplay(`${h}:${m}:${sc}`)
    }, 1000)

    // Sincroniza sempre que o usuário voltar para a aba
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchToday()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [fetchToday])

  // Registra ponto
  const registrarPonto = async () => {
    const s = getSession()
    if (!s || loadingPonto) return
    setLoadingPonto(true)
    setPontoMsg(null)
    try {
      const res  = await fetch(`${SURL}/functions/v1/registrar-ponto`, {
        method: 'POST', headers: efHeaders(),
        body: JSON.stringify({ session_token: s.session }),
      })
      const data = await res.json()
      if (data.error) {
        setPontoMsg({ type: 'err', text: data.error })
      } else {
        setTodayRecords(data.today_records || [])
        const rec   = data.record
        const label = TIPO_LABEL[rec.tipo_registro] || rec.tipo_registro
        
        // Ativa animação de sucesso
        setShowSuccess(true)
        setTimeout(() => setShowSuccess(false), 2500)
        
        setPontoMsg({ type: 'ok', text: `${label} registrado às ${toLocalTime(rec.created_at)}` })
        setTimeout(() => setPontoMsg(null), 4000)
        const d = new Date()
        if (selMes === d.getMonth() + 1 && selAno === d.getFullYear()) {
          fetchMes(selMes, selAno)
        }
      }
    } catch {
      setPontoMsg({ type: 'err', text: 'Erro de conexão. Tente novamente.' })
    } finally {
      setLoadingPonto(false)
    }
  }

  // Exclui todos os registros de um dia (admin)
  const deletarDia = async (row: DayRow) => {
    if (!confirm(`Mover os registros de ${row.dateLabel} para a lixeira?`)) return
    const s = getSession()
    if (!s) return
    setDeletingRow(row.dateStr)
    try {
      const res  = await fetch(`${SURL}/functions/v1/admin-ponto-delete`, {
        method: 'POST', headers: efHeaders(),
        body: JSON.stringify({ session_token: s.session, record_ids: row.recordIds }),
      })
      const data = await res.json()
      if (data.error) {
        alert(`Erro: ${data.error}`)
      } else {
        fetchMes(selMes, selAno)
        fetchToday()
      }
    } catch {
      alert('Erro de conexão.')
    } finally {
      setDeletingRow(null)
    }
  }

  if (!sess) return <NGPLoading loading loadingText="Carregando setor de pessoas..." />

  const nextAction               = getNextAction(todayRecords)
  const { totalMins: todayMins } = calcBalance(todayRecords)
  const dayRows                  = groupByDay(mesRecords)
  const findToday                = (tipo: string) => todayRecords.find(r => r.tipo_registro === tipo)

  // Nav do setor Pessoas na sidebar
  const IcoTabela = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" width={15} height={15}>
      <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/>
      <line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/>
    </svg>
  )

  const sectorNav = [
    { icon: <IcoRelogio />, label: 'Dashboard', href: '/pessoas' },
    { icon: <IcoTabela />,  label: 'Registros de Ponto', href: '/pessoas/registros' },
    { icon: <IcoCarreira />, label: 'Colaboradores', href: '/pessoas/carreira' },
    ...(isAdmin ? [{ icon: <IcoTabela />, label: 'Cadastros', href: '/pessoas/cadastros' }] : []),
    ...(isAdmin ? [{ icon: <IcoLixeira />, label: 'Lixeira', href: '/pessoas/lixeira' }] : []),
  ]

  return (
    <div className={styles.layout}>
      <Sidebar showDashboardNav={false} minimal sectorNav={sectorNav} sectorNavTitle="PESSOAS" />
      <NGPLoading loading={loadingPonto} success={showSuccess} />

      <main className={styles.main}>
        <div className={styles.content}>

          {/* ── Header ─────────────────────────────────────────────────── */}
          <header className={styles.header}>
            <button className={styles.btnBack} onClick={() => router.push('/setores')}>
              ← Setores
            </button>
            <div className={styles.eyebrow}>Setor · Pessoas</div>
            <h1 className={styles.title}>Dashboard</h1>
            <p className={styles.subtitle}>Visão geral do setor de Pessoas com jornada, cadastros e desenvolvimento da equipe.</p>
          </header>

          {isAdmin && (
            <>
              <section className={styles.hero}>
                <div>
                  <div className={styles.heroLabel}>Dashboard</div>
                  <h2 className={styles.heroTitle}>Visão de desenvolvimento da equipe NGP</h2>
                  <p className={styles.heroText}>
                    Acompanhe cargos, funções, senioridades e horas trabalhadas da equipe sem entrar em cada colaborador.
                  </p>
                </div>
                <div className={styles.heroStats}>
                  <div className={styles.statCard}>
                    <span className={styles.statValue}>{dashboardData?.cards.total_colaboradores || 0}</span>
                    <span className={styles.statLabel}>Colaboradores ativos</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statValue}>{fmtMins(dashboardData?.cards.total_horas_semana_mins || 0)}</span>
                    <span className={styles.statLabel}>Horas da semana</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statValue}>{fmtMins(dashboardData?.cards.total_horas_mes_mins || 0)}</span>
                    <span className={styles.statLabel}>Horas do mês</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statValue}>{dashboardData?.cards.total_funcoes || 0}</span>
                    <span className={styles.statLabel}>Funções cadastradas</span>
                  </div>
                </div>
              </section>

              <section className={styles.dashboardGrid}>
                <div className={styles.mesSection}>
                  <div className={styles.mesHeader}>
                    <h2 className={styles.mesTitle}>Distribuição por função</h2>
                    <span className={styles.sectionHint}>Equipe atual</span>
                  </div>
                  <div className={styles.distributionList}>
                    {loadingDashboard ? (
                      <div className={styles.mesLoading}>Carregando dashboard...</div>
                    ) : dashboardData?.distribuicoes.por_funcao.length ? (
                      dashboardData.distribuicoes.por_funcao.map((item) => (
                        <div key={item.label} className={styles.distributionItem}>
                          <span>{item.label}</span>
                          <strong>{item.count}</strong>
                        </div>
                      ))
                    ) : (
                      <div className={styles.mesEmpty}>Nenhuma função cadastrada ainda.</div>
                    )}
                  </div>
                </div>

                <div className={styles.mesSection}>
                  <div className={styles.mesHeader}>
                    <h2 className={styles.mesTitle}>Cargo e senioridade</h2>
                    <span className={styles.sectionHint}>Base do setor</span>
                  </div>
                  <div className={styles.dualDistribution}>
                    <div className={styles.distributionBlock}>
                      <div className={styles.distributionTitle}>Cargos</div>
                      <div className={styles.distributionList}>
                        {dashboardData?.distribuicoes.por_cargo.length ? dashboardData.distribuicoes.por_cargo.map((item) => (
                          <div key={item.label} className={styles.distributionItem}>
                            <span>{item.label}</span>
                            <strong>{item.count}</strong>
                          </div>
                        )) : <div className={styles.mesEmpty}>Sem cargos.</div>}
                      </div>
                    </div>
                    <div className={styles.distributionBlock}>
                      <div className={styles.distributionTitle}>Senioridades</div>
                      <div className={styles.distributionList}>
                        {dashboardData?.distribuicoes.por_senioridade.length ? dashboardData.distribuicoes.por_senioridade.map((item) => (
                          <div key={item.label} className={styles.distributionItem}>
                            <span>{item.label}</span>
                            <strong>{item.count}</strong>
                          </div>
                        )) : <div className={styles.mesEmpty}>Sem senioridades.</div>}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* ── Registros mensais ──────────────────────────────────────── */}
          <section className={styles.mesSection}>
            <div className={styles.mesHeader}>
              <h2 className={styles.mesTitle}>Histórico de Registros</h2>
              <div className={styles.mesFilter}>
                {isAdmin && (
                  <label className={styles.adminToggle}>
                    <input
                      type="checkbox"
                      checked={viewAll}
                      onChange={e => setViewAll(e.target.checked)}
                    />
                    Todos os usuários
                  </label>
                )}
                <CustomSelect
                  caption="Mês"
                  value={selMes.toString()}
                  options={MONTHS.map((m, i) => ({ id: (i + 1).toString(), label: m }))}
                  onChange={next => setSelMes(Number(next))}
                />
                <CustomSelect
                  caption="Ano"
                  value={selAno.toString()}
                  options={[2025, 2026, 2027].map(a => ({ id: a.toString(), label: a.toString() }))}
                  onChange={next => setSelAno(Number(next))}
                />
              </div>
            </div>

            {loadingMes ? (
              <div className={styles.mesLoading}>Carregando registros...</div>
            ) : dayRows.length === 0 ? (
              <div className={styles.mesEmpty}>
                Nenhum registro em {MONTHS[selMes - 1]}/{selAno}.
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Usuário</th>
                      <th>Data</th>
                      <th>Entrada</th>
                      <th>S. Almoço</th>
                      <th>R. Almoço</th>
                      <th>Saída</th>
                      <th>Extra Ent.</th>
                      <th>Extra Saí.</th>
                      <th>Total</th>
                      <th>H. Extras</th>
                      <th>Status</th>
                      {isAdmin && <th className={styles.thAcoes}>Ações</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {dayRows.map(row => (
                      <tr key={row.uniqueKey}>
                        <td className={styles.tdUsuario}>{row.usuarioNome || sess.username || sess.user}</td>
                        <td className={styles.tdDate}>{row.dateLabel}</td>
                        <td>{row.entrada      || <span className={styles.tdEmpty}>--:--</span>}</td>
                        <td>{row.saidaAlmoco  || <span className={styles.tdEmpty}>--:--</span>}</td>
                        <td>{row.retornoAlmoco|| <span className={styles.tdEmpty}>--:--</span>}</td>
                        <td>{row.saida        || <span className={styles.tdEmpty}>--:--</span>}</td>
                        <td className={styles.tdExtraCol}>
                          {row.extras.length > 0 ? (
                            <div className={styles.extraPairs}>
                              {row.extras.map((pair, i) => (
                                <div key={i} className={styles.extraPair}>
                                  <span>{pair.entrada || '--:--'}</span>
                                </div>
                              ))}
                            </div>
                          ) : <span className={styles.tdEmpty}>--:--</span>}
                        </td>
                        <td className={styles.tdExtraCol}>
                          {row.extras.length > 0 ? (
                            <div className={styles.extraPairs}>
                              {row.extras.map((pair, i) => (
                                <div key={i} className={styles.extraPair}>
                                  <span>{pair.saida || '--:--'}</span>
                                </div>
                              ))}
                            </div>
                          ) : <span className={styles.tdEmpty}>--:--</span>}
                        </td>
                        <td className={styles.tdTotal}>
                          {row.totalMins > 0 ? fmtMins(row.totalMins) : <span className={styles.tdEmpty}>--</span>}
                        </td>
                        <td className={styles.tdTotal}>
                          {row.extrasMins > 0 ? fmtMins(row.extrasMins) : <span className={styles.tdEmpty}>--</span>}
                        </td>
                        <td>
                          <span
                            className={styles.statusBadge}
                            style={{
                              color:      STATUS_COLOR[row.status],
                              background: STATUS_COLOR[row.status] + '18',
                            }}
                          >
                            {STATUS_LABEL[row.status]}
                          </span>
                        </td>
                        {isAdmin && (
                          <td>
                            <button
                              className={styles.btnDelete}
                              onClick={() => deletarDia(row)}
                              disabled={deletingRow === row.dateStr}
                              title="Mover para lixeira"
                            >
                              {deletingRow === row.dateStr
                                ? <span className={styles.spinnerDark} />
                                : <IcoTrash />
                              }
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

        </div>
      </main>
    </div>
  )
}
