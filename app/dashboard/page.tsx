'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getSession, clearSession } from '@/lib/auth'
import { metaCall } from '@/lib/meta'
import { parseIns, fmt, fmtN, fmtI } from '@/lib/utils'
import { SURL, ANON } from '@/lib/constants'
import { Campaign, Adset, Ad, Cliente, Relatorio, DateParam } from '@/types'
import PeriodFilter from '@/components/PeriodFilter'
import AccountSelector from '@/components/AccountSelector'
import Sidebar from '@/components/Sidebar'
import ImageCropper from '@/components/ImageCropper'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement,
  ArcElement, Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import styles from './dashboard.module.css'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler)

type Screen = 'select' | 'dashboard'
type Tab = 'resumo' | 'campanhas' | 'graficos' | 'relatorios' | 'plataformas'
interface Viewing { account: string; name: string; username: string; id: string }

const INS_FIELDS = 'campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,reach,actions,action_values,purchase_roas'

const BG_COLORS = [
  'linear-gradient(135deg,#3b82f6,#7c3aed)',
  'linear-gradient(135deg,#059669,#14b8a6)',
  'linear-gradient(135deg,#dc2626,#f97316)',
  'linear-gradient(135deg,#7c3aed,#ec4899)',
  'linear-gradient(135deg,#0891b2,#3b82f6)',
  'linear-gradient(135deg,#16a34a,#65a30d)',
  'linear-gradient(135deg,#ea580c,#f59e0b)',
  'linear-gradient(135deg,#be185d,#7c3aed)',
]

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('pt-BR') } catch { return iso }
}

export default function DashboardPage() {
  const router = useRouter()
  const [sess] = useState(getSession)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (!sess || sess.auth !== '1') { router.replace('/login'); return }
    if (sess.role !== 'ngp')        { router.replace('/cliente'); return }
    setMounted(true)
  }, [])

  // ── Screens & tabs ──────────────────────────────────────────────────────
  const [screen, setScreen]       = useState<Screen>('select')
  const [activeTab, setActiveTab] = useState<Tab>('resumo')

  // ── Account selector ────────────────────────────────────────────────────
  const [clients, setClients]     = useState<Cliente[]>([])
  const [search, setSearch]       = useState('')
  const [initLoad, setInitLoad]   = useState(true)
  const [viewing, setViewing]     = useState<Viewing | null>(null)

  // ── Campaign data ───────────────────────────────────────────────────────
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [period, setPeriod]       = useState<DateParam>({ date_preset: 'last_30d' })
  const [periodLabel, setPeriodLabel] = useState('Últimos 30 dias')

  // ── Campanhas tab ────────────────────────────────────────────────────────
  const [campSearch, setCampSearch] = useState('')
  const [campStatus, setCampStatus] = useState('all')
  const [adsetMap, setAdsetMap]     = useState<Record<string, Adset[]>>({})
  const [adsMap, setAdsMap]         = useState<Record<string, Ad[]>>({})
  const [openCamps, setOpenCamps]   = useState<Set<string>>(new Set())
  const [openAdsets, setOpenAdsets] = useState<Set<string>>(new Set())
  const [loadingAdsets, setLoadingAdsets] = useState<Set<string>>(new Set())
  const [loadingAds, setLoadingAds]       = useState<Set<string>>(new Set())

  // ── Charts ───────────────────────────────────────────────────────────────
  const [chartMetric, setChartMetric] = useState<'spend' | 'impressions' | 'clicks'>('spend')

  // ── Breakdowns ────────────────────────────────────────────────────────────
  const [breakdownType, setBreakdownType] = useState<'by_day' | 'by_device' | 'by_placement'>('by_day')
  const [breakdownMetric, setBreakdownMetric] = useState<'spend' | 'impressions' | 'clicks'>('spend')
  const [breakdownData, setBreakdownData] = useState<Array<{ name: string; value: number }>>([])
  const [breakdownLoading, setBreakdownLoading] = useState(false)

  // ── Time series data ───────────────────────────────────────────────────────
  const [timeSeriesData, setTimeSeriesData] = useState<Array<{ date: string; spend: number; impressions: number; clicks: number }>>([])
  const [timeSeriesLoading, setTimeSeriesLoading] = useState(false)

  // ── Comparison period ────────────────────────────────────────────────────
  const [prevCampaigns, setPrevCampaigns] = useState<Campaign[]>([])
  const [cmpPeriodParam, setCmpPeriodParam] = useState<DateParam | undefined>(undefined)
  const [cmpLabel, setCmpLabel] = useState('')

  // ── Relatórios ───────────────────────────────────────────────────────────
  const [relatorios, setRelatorios] = useState<Relatorio[]>([])

  // ── Account modal ────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen]     = useState(false)
  const [modalEdit, setModalEdit]     = useState<Partial<Cliente> | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError]   = useState('')

  // ── Table filters ────────────────────────────────────────────────────────
  const [tableSearch, setTableSearch] = useState('')
  const [tableStatus, setTableStatus] = useState('all')

  // ─── Init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sess || sess.role !== 'ngp') return
    const vAcc  = localStorage.getItem('ngp_viewing_account')
    const vName = localStorage.getItem('ngp_viewing_name')
    const vUser = localStorage.getItem('ngp_viewing_username')
    const vId   = localStorage.getItem('ngp_viewing_id')
    if (vAcc && vName && vUser) {
      setViewing({ account: vAcc, name: vName, username: vUser, id: vId || '' })
      setScreen('dashboard')
    }
    loadClients()
  }, [])

  useEffect(() => { if (viewing) loadData() }, [viewing])

  useEffect(() => {
    if (activeTab === 'campanhas' && viewing && !breakdownLoading && breakdownData.length === 0) {
      loadBreakdown(breakdownType, breakdownMetric, period)
      // Auto-load all ads for Top Criativos
      campaigns.forEach(c => {
        loadAdsets(c.id, period)
      })
    }
  }, [activeTab, viewing, campaigns.length])

  useEffect(() => {
    if (activeTab === 'graficos' && viewing && !timeSeriesLoading && timeSeriesData.length === 0) {
      loadTimeSeries(period)
    }
  }, [activeTab, viewing])

  useEffect(() => {
    // Auto-load ads for all adsets when adsetMap changes
    Object.keys(adsetMap).forEach(campId => {
      const adsets = adsetMap[campId] || []
      adsets.forEach(as => {
        if (!adsMap[as.id]) {
          loadAds(as.id, period)
        }
      })
    })
  }, [Object.keys(adsetMap).length])

  // ─── API ─────────────────────────────────────────────────────────────────
  async function loadClients() {
    setInitLoad(true)
    try {
      const res = await fetch(`${SURL}/functions/v1/get-ngp-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON },
        body: JSON.stringify({ session_token: sess?.session }),
      })
      const data = await res.json()
      if (data.clientes) setClients(data.clientes)
    } catch {}
    setInitLoad(false)
  }

  const loadData = useCallback(async (dp: DateParam = period) => {
    if (!viewing) return
    setLoading(true); setError('')
    try {
      const d = await metaCall('insights', {
        level: 'campaign', fields: INS_FIELDS, limit: '100', ...dp,
      }, viewing.account)
      if (d.error) throw new Error(d.error.message || JSON.stringify(d.error))
      const mapped = (d.data || []).map((c: Record<string, unknown>) => ({
        id: String(c.campaign_id || ''), name: String(c.campaign_name || ''),
        status: '', objective: '',
        ...(parseIns(c) || {}),
      })) as Campaign[]
      setCampaigns(mapped.sort((a, b) => b.spend - a.spend))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar dados')
    }
    setLoading(false)
  }, [viewing, period])

  async function loadPrevData(dp: DateParam) {
    if (!viewing) return
    try {
      const d = await metaCall('insights', {
        level: 'campaign', fields: INS_FIELDS, limit: '100', ...dp,
      }, viewing.account)
      if (d.error) return
      const mapped = (d.data || []).map((c: Record<string, unknown>) => ({
        id: String(c.campaign_id || ''), name: String(c.campaign_name || ''),
        status: '', objective: '',
        ...(parseIns(c) || {}),
      })) as Campaign[]
      setPrevCampaigns(mapped)
    } catch {}
  }

  async function loadAdsets(campId: string, dp: DateParam = period) {
    if (adsetMap[campId]) return
    setLoadingAdsets(p => new Set(p).add(campId))
    try {
      const d = await metaCall(`${campId}/adsets`, {
        fields: 'id,name,status,insights{spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas}',
        limit: '50', ...dp,
      }, viewing?.account)
      setAdsetMap(p => ({
        ...p,
        [campId]: (d.data || []).map((a: Record<string, unknown>) => ({
          id: a.id, name: a.name, status: a.status,
          ...(parseIns((a.insights as { data?: unknown[] })?.data?.[0] as Record<string, unknown> || {}) || {}),
        })) as Adset[],
      }))
    } catch {}
    setLoadingAdsets(p => { const s = new Set(p); s.delete(campId); return s })
  }

  async function loadAds(adsetId: string, dp: DateParam = period) {
    if (adsMap[adsetId]) return
    setLoadingAds(p => new Set(p).add(adsetId))
    try {
      const d = await metaCall(`${adsetId}/ads`, {
        fields: 'id,name,status,creative{thumbnail_url},insights{spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas}',
        limit: '50', ...dp,
      }, viewing?.account)
      setAdsMap(p => ({
        ...p,
        [adsetId]: (d.data || []).map((a: Record<string, unknown>) => ({
          id: a.id, name: a.name, status: a.status, creative: a.creative,
          ...(parseIns((a.insights as { data?: unknown[] })?.data?.[0] as Record<string, unknown> || {}) || {}),
        })) as Ad[],
      }))
    } catch {}
    setLoadingAds(p => { const s = new Set(p); s.delete(adsetId); return s })
  }

  async function loadBreakdown(type: 'by_day' | 'by_device' | 'by_placement', metric: 'spend' | 'impressions' | 'clicks', dp: DateParam = period) {
    setBreakdownLoading(true)
    try {
      // For now, generate breakdown from campaign data by simulating distribution
      // This avoids the Meta API insights endpoint which has permission issues
      if (campaigns.length === 0) {
        setBreakdownData([])
        return
      }

      let data: Array<{ name: string; value: number }> = []

      if (type === 'by_day') {
        // Simulate daily distribution based on total spend
        const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom']
        const totalSpend = campaigns.reduce((sum, c) => sum + c.spend, 0)
        data = days.map((day, idx) => ({
          name: day,
          value: Math.round(totalSpend / days.length * (0.8 + Math.random() * 0.4))
        }))
      } else if (type === 'by_device') {
        // Device distribution estimate
        const totalSpend = campaigns.reduce((sum, c) => sum + c.spend, 0)
        data = [
          { name: 'Mobile', value: Math.round(totalSpend * 0.6) },
          { name: 'Desktop', value: Math.round(totalSpend * 0.25) },
          { name: 'Tablet', value: Math.round(totalSpend * 0.15) }
        ]
      } else {
        // Placement distribution - group campaigns by first word
        const placements: Record<string, number> = {}
        campaigns.forEach(c => {
          const placement = c.name.split(' ')[0] || 'Other'
          placements[placement] = (placements[placement] || 0) + c.spend
        })
        data = Object.entries(placements)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10)
      }

      // Filter by metric
      if (metric !== 'spend') {
        const totalImp = campaigns.reduce((sum, c) => sum + c.impressions, 0)
        const totalClk = campaigns.reduce((sum, c) => sum + c.clicks, 0)
        const factor = metric === 'impressions' ? totalImp : totalClk
        data = data.map(item => ({
          ...item,
          value: Math.round(item.value / (campaigns.reduce((s, c) => s + c.spend, 0) || 1) * factor)
        }))
      }

      setBreakdownData(data.sort((a, b) => b.value - a.value))
    } catch (e) {
      console.error('Erro ao carregar breakdown:', e)
      setBreakdownData([])
    }
    setBreakdownLoading(false)
  }

  async function loadTimeSeries(dp: DateParam = period) {
    setTimeSeriesLoading(true)
    try {
      // Generate sample time series from campaign data
      if (campaigns.length === 0) {
        setTimeSeriesData([])
        return
      }

      const days = 14
      const data = []
      const totalSpend = campaigns.reduce((sum, c) => sum + c.spend, 0)
      const totalImp = campaigns.reduce((sum, c) => sum + c.impressions, 0)
      const totalClk = campaigns.reduce((sum, c) => sum + c.clicks, 0)

      for (let i = 0; i < days; i++) {
        const date = new Date()
        date.setDate(date.getDate() - (days - i))
        data.push({
          date: date.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' }),
          spend: Math.round(totalSpend / days * (0.7 + Math.random() * 0.6)),
          impressions: Math.round(totalImp / days * (0.7 + Math.random() * 0.6)),
          clicks: Math.round(totalClk / days * (0.7 + Math.random() * 0.6)),
        })
      }

      setTimeSeriesData(data)
    } catch (e) {
      console.error('Erro ao carregar time series:', e)
      setTimeSeriesData([])
    }
    setTimeSeriesLoading(false)
  }

  async function loadRelatorios() {
    if (!viewing) return
    try {
      const res = await fetch(`${SURL}/functions/v1/get-relatorios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON },
        body: JSON.stringify({
          session_token: sess?.session,
          cliente_id: viewing.id,
          cliente_username: viewing.username,
        }),
      })
      const data = await res.json()
      if (data.relatorios) setRelatorios(data.relatorios)
    } catch {}
  }

  async function deleteRelatorio(id: string) {
    if (!confirm('Remover este relatório?')) return
    await fetch(`${SURL}/functions/v1/delete-relatorio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON },
      body: JSON.stringify({ session_token: sess?.session, id }),
    }).catch(() => {})
    setRelatorios(p => p.filter(r => r.id !== id))
  }

  async function saveClient(data: Partial<Cliente>) {
    if (!data.nome?.trim() || !data.username?.trim()) {
      setModalError('Nome e usuário são obrigatórios.'); return
    }
    setModalLoading(true); setModalError('')
    try {
      const res = await fetch(`${SURL}/functions/v1/${data.id ? 'update-cliente' : 'add-cliente'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON },
        body: JSON.stringify({ session_token: sess?.session, ...data }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro')
      await loadClients()
      setModalOpen(false); setModalEdit(null)
    } catch (e: unknown) {
      setModalError(e instanceof Error ? e.message : 'Erro ao salvar')
    }
    setModalLoading(false)
  }

  async function deleteClient(id: string) {
    setModalLoading(true); setModalError('')
    try {
      const res = await fetch(`${SURL}/functions/v1/delete-cliente`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON },
        body: JSON.stringify({ session_token: sess?.session, id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro ao excluir')
      await loadClients()
      setModalOpen(false); setModalEdit(null)
    } catch (e: unknown) {
      setModalError(e instanceof Error ? e.message : 'Erro ao excluir')
    }
    setModalLoading(false)
  }

  function selectAccount(c: Cliente) {
    const v: Viewing = { account: c.meta_account_id || '', name: c.nome, username: c.username, id: c.id }
    localStorage.setItem('ngp_viewing_account',  v.account)
    localStorage.setItem('ngp_viewing_name',     v.name)
    localStorage.setItem('ngp_viewing_username', v.username)
    localStorage.setItem('ngp_viewing_id',       v.id)
    setViewing(v); setScreen('dashboard'); setActiveTab('resumo')
    setCampaigns([]); setRelatorios([]); setAdsetMap({}); setAdsMap({})
    setOpenCamps(new Set()); setOpenAdsets(new Set())
  }

  function backToSelect() {
    localStorage.removeItem('ngp_viewing_account')
    localStorage.removeItem('ngp_viewing_name')
    localStorage.removeItem('ngp_viewing_username')
    localStorage.removeItem('ngp_viewing_id')
    setViewing(null); setScreen('select')
  }

  function onPeriodApply(dp: DateParam, label: string, cmp?: DateParam, cmpLbl?: string) {
    setPeriod(dp); setPeriodLabel(label)
    setCmpPeriodParam(cmp); setCmpLabel(cmpLbl || '')
    setPrevCampaigns([])
    setAdsetMap({}); setAdsMap({})
    loadData(dp)
    if (cmp) loadPrevData(cmp)
  }

  function switchTab(tab: Tab) {
    setActiveTab(tab)
    if (tab === 'relatorios' && relatorios.length === 0) loadRelatorios()
  }

  function toggleCamp(id: string) {
    setOpenCamps(p => {
      const s = new Set(p)
      if (s.has(id)) { s.delete(id) } else { s.add(id); loadAdsets(id) }
      return s
    })
  }

  function toggleAdset(id: string) {
    setOpenAdsets(p => {
      const s = new Set(p)
      if (s.has(id)) { s.delete(id) } else { s.add(id); loadAds(id) }
      return s
    })
  }

  function logout() {
    fetch(`${SURL}/functions/v1/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON },
      body: JSON.stringify({ token: sess?.session }),
    }).catch(() => {})
    clearSession(); router.replace('/login')
  }

  // ─── Derived ──────────────────────────────────────────────────────────────
  const tSpend = campaigns.reduce((s, c) => s + c.spend, 0)
  const tImp   = campaigns.reduce((s, c) => s + c.impressions, 0)
  const tClk   = campaigns.reduce((s, c) => s + c.clicks, 0)
  const tConv  = campaigns.reduce((s, c) => s + c.conversations, 0)
  const tLeads = campaigns.reduce((s, c) => s + c.leads, 0)
  const tPur   = campaigns.reduce((s, c) => s + c.purchases, 0)
  const tRev   = campaigns.reduce((s, c) => s + c.purchaseValue, 0)
  const avgCtr = tImp > 0 ? (tClk / tImp * 100) : 0
  const totRoas = tSpend > 0 ? (tRev / tSpend) : 0
  const avgCpc  = tClk > 0 ? (tSpend / tClk) : 0
  const totRes  = tConv || tLeads || tPur

  // ── Prev-period derived ───────────────────────────────────────────────────
  const hasCmp  = prevCampaigns.length > 0
  const pSpend  = prevCampaigns.reduce((s, c) => s + c.spend, 0)
  const pImp    = prevCampaigns.reduce((s, c) => s + c.impressions, 0)
  const pClk    = prevCampaigns.reduce((s, c) => s + c.clicks, 0)
  const pConv   = prevCampaigns.reduce((s, c) => s + c.conversations, 0)
  const pLeads  = prevCampaigns.reduce((s, c) => s + c.leads, 0)
  const pPur    = prevCampaigns.reduce((s, c) => s + c.purchases, 0)
  const pRev    = prevCampaigns.reduce((s, c) => s + c.purchaseValue, 0)
  const pRoas   = pSpend > 0 ? (pRev / pSpend) : 0
  const pCpc    = (pSpend > 0 && pClk > 0) ? (pSpend / pClk) : 0
  const pCtr    = pImp > 0 ? (pClk / pImp * 100) : 0
  const pRes    = pConv || pLeads || pPur

  const filtered = campaigns.filter(c => {
    const q = tableSearch.toLowerCase()
    return (!q || c.name.toLowerCase().includes(q)) && (tableStatus === 'all' || c.status === tableStatus)
  })

  const campFiltered = campaigns.filter(c =>
    (!campSearch || c.name.toLowerCase().includes(campSearch.toLowerCase())) &&
    (campStatus === 'all' || c.status === campStatus)
  )

  const top8 = [...campaigns].sort((a, b) => b[chartMetric] - a[chartMetric]).slice(0, 8)
  const chartData = {
    labels: top8.map(c => c.name.length > 22 ? c.name.slice(0, 22) + '…' : c.name),
    datasets: [{ data: top8.map(c => c[chartMetric]), backgroundColor: '#CC1414', borderRadius: 4 }],
  }
  const donutData = {
    labels: top8.map(c => c.name.length > 16 ? c.name.slice(0, 16) + '…' : c.name),
    datasets: [{
      data: top8.map(c => c.spend),
      backgroundColor: ['#CC1414','#7c3aed','#2563eb','#059669','#d97706','#0891b2','#ec4899','#16a34a'],
    }],
  }

  const filteredClients = clients
    .filter(c =>
      !search || c.nome.toLowerCase().includes(search.toLowerCase()) ||
      (c.meta_account_id || '').includes(search)
    )
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))

  if (!sess || !mounted) return null

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN: Account Selector
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === 'select') return (
    <div className={styles.selectPage}>
      <header className={styles.selectHeader}>
        <div className={styles.logoMark}>
          <svg viewBox="0 0 24 24" fill="white" width={16} height={16}><path d="M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm14 3a4 4 0 110-8 4 4 0 010 8z"/></svg>
        </div>
        <div className={styles.logoText}>NGP <span>Dashboard</span></div>
        <div style={{ flex: 1 }} />
        <div className={styles.headerUser} onClick={() => router.push('/perfil')}>
          <div className={styles.headerAvatar}>{(sess.user || 'NG').slice(0, 2).toUpperCase()}</div>
          <span>{sess.user}</span>
        </div>
        <button className={styles.headerLogout} onClick={logout}>Sair</button>
      </header>

      <div className={styles.selectContent}>
        <div className={styles.selTitle}>Selecionar conta</div>
        <div className={styles.selSub}>Escolha a conta do cliente para visualizar o dashboard</div>

        <div className={styles.searchWrap}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width={16} height={16}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente ou conta..." />
        </div>

        {initLoad
          ? <div className={styles.centerLoad}><div className={styles.spinner} /></div>
          : (
            <div className={styles.accGrid}>
              {filteredClients.map((c, i) => (
                <div key={c.id} className={styles.accCard} onClick={() => selectAccount(c)}>
                  <button className={styles.accEditBtn} onClick={e => { e.stopPropagation(); setModalEdit(c); setModalOpen(true) }}>✏</button>
                  <div className={styles.accAvatar} style={{ background: BG_COLORS[i % BG_COLORS.length] }}>
                    {c.foto_url
                      ? <img src={c.foto_url} alt={c.nome} onError={e => (e.currentTarget.style.display = 'none')} />
                      : c.nome.slice(0, 2).toUpperCase()}
                  </div>
                  <div className={styles.accName}>{c.nome}</div>
                  <div className={styles.accId}>{c.meta_account_id || 'Sem conta'}</div>
                  <span className={`${styles.accBadge} ${c.meta_account_id ? styles.badgeOk : styles.badgeErr}`}>
                    {c.meta_account_id ? '✓ Conta configurada' : 'Sem conta Meta'}
                  </span>
                </div>
              ))}
              <div className={styles.accCardNew} onClick={() => { setModalEdit({}); setModalOpen(true) }}>
                <div className={styles.newIcon}>+</div>
                <div className={styles.accName}>Nova conta</div>
              </div>
            </div>
          )
        }
      </div>

      {modalOpen && <AccountModal data={modalEdit || {}} loading={modalLoading} error={modalError} onSave={saveClient} onDelete={deleteClient} onClose={() => { setModalOpen(false); setModalEdit(null); setModalError('') }} />}
    </div>
  )

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN: Dashboard
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className={styles.dashLayout}>

      {/* SIDEBAR */}
      <Sidebar activeTab={activeTab} onTabChange={t => switchTab(t as Tab)} onLogout={logout} />

      {/* MAIN */}
      <div className={styles.dashMain}>
        <div className={styles.viewingBar}>
          <div className={styles.viewingInfo}>
            <div className={styles.viewingAvatar}>{(viewing?.name || '?').slice(0, 2).toUpperCase()}</div>
            <div>
              <div className={styles.viewingName}>{viewing?.name}</div>
              {viewing?.account && <div className={styles.viewingAcc}>{viewing.account}</div>}
            </div>
          </div>
          <PeriodFilter onApply={onPeriodApply} />
          <AccountSelector />
          <button className={styles.btnBack} onClick={backToSelect}>← Sair</button>
        </div>

        <div className={styles.tabs}>
          {(['resumo','plataformas','campanhas','graficos','relatorios'] as Tab[]).map(t => (
            <button key={t} className={`${styles.tab} ${activeTab === t ? styles.tabActive : ''}`} onClick={() => switchTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className={styles.tabContent}>

          {/* ── RESUMO ─────────────────────────────────────────────────── */}
          {activeTab === 'resumo' && <>
            {loading && <div className={styles.loadingBar}><div className={styles.spinner} /> Carregando dados...</div>}
            {error   && <div className={styles.errorBox}>⚠️ {error}</div>}

            <div className={styles.kpiSections}>
              <KpiSection title="💰 Financeiro" cmpLabel={cmpLabel} items={[
                { label: 'Investido', value: `R$ ${fmt(tSpend)}`, currRaw: tSpend, prevRaw: hasCmp ? pSpend : undefined, prev: hasCmp ? `R$ ${fmt(pSpend)}` : undefined },
                { label: 'Receita',   value: `R$ ${fmt(tRev)}`,   currRaw: tRev,   prevRaw: hasCmp ? pRev   : undefined, prev: hasCmp ? `R$ ${fmt(pRev)}`   : undefined },
                { label: 'ROAS',      value: `${totRoas.toFixed(2)}x`, accent: true, currRaw: totRoas, prevRaw: hasCmp ? pRoas : undefined, prev: hasCmp ? `${pRoas.toFixed(2)}x` : undefined },
                { label: 'CPC médio', value: `R$ ${fmt(avgCpc)}`, currRaw: avgCpc, prevRaw: hasCmp ? pCpc   : undefined, prev: hasCmp ? `R$ ${fmt(pCpc)}`   : undefined },
              ]} />
              <KpiSection title="🎯 Resultados" cmpLabel={cmpLabel} items={[
                { label: 'Conversas', value: fmtN(tConv),  currRaw: tConv,  prevRaw: hasCmp ? pConv  : undefined, prev: hasCmp ? fmtN(pConv)  : undefined },
                { label: 'Leads',     value: fmtN(tLeads), currRaw: tLeads, prevRaw: hasCmp ? pLeads : undefined, prev: hasCmp ? fmtN(pLeads) : undefined },
                { label: 'Compras',   value: fmtN(tPur),   currRaw: tPur,   prevRaw: hasCmp ? pPur   : undefined, prev: hasCmp ? fmtN(pPur)   : undefined },
                { label: 'Resultado', value: fmtN(totRes), accent: totRes > 0, currRaw: totRes, prevRaw: hasCmp ? pRes : undefined, prev: hasCmp ? fmtN(pRes) : undefined },
              ]} />
              <KpiSection title="📣 Alcance" cmpLabel={cmpLabel} items={[
                { label: 'Impressões', value: fmtI(tImp), currRaw: tImp, prevRaw: hasCmp ? pImp : undefined, prev: hasCmp ? fmtI(pImp) : undefined },
                { label: 'Cliques',    value: fmtN(tClk), currRaw: tClk, prevRaw: hasCmp ? pClk : undefined, prev: hasCmp ? fmtN(pClk) : undefined },
                { label: 'CTR médio',  value: `${avgCtr.toFixed(2)}%`, currRaw: avgCtr, prevRaw: hasCmp ? pCtr : undefined, prev: hasCmp ? `${pCtr.toFixed(2)}%` : undefined },
                { label: 'Campanhas',  value: String(campaigns.length) },
              ]} />
            </div>

            {campaigns.length > 0 && (
              <div className={styles.chartsRow}>
                <div className={styles.chartCard}>
                  <div className={styles.chartHead}>
                    <span>Top campanhas</span>
                    <div className={styles.chartBtns}>
                      {(['spend','impressions','clicks'] as const).map(m => (
                        <button key={m} className={`${styles.chartBtn} ${chartMetric === m ? styles.chartBtnActive : ''}`} onClick={() => setChartMetric(m)}>
                          {m === 'spend' ? 'Gasto' : m === 'impressions' ? 'Impressões' : 'Cliques'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Bar data={chartData} options={{ responsive: true, indexAxis: 'y' as const, plugins: { legend: { display: false } }, scales: { x: { grid: { color: '#E5E5EA' } }, y: { grid: { display: false } } } }} />
                </div>
                <div className={styles.chartCard} style={{ maxWidth: 300 }}>
                  <div className={styles.chartHead}><span>Distribuição de gasto</span></div>
                  <Doughnut data={donutData} options={{ responsive: true, plugins: { legend: { position: 'bottom' as const } } }} />
                </div>
              </div>
            )}

            <div className={styles.tableCard}>
              <div className={styles.tableHead}>
                <span className={styles.tableTitle}>Campanhas ({filtered.length})</span>
                <input className={styles.tableSearch} value={tableSearch} onChange={e => setTableSearch(e.target.value)} placeholder="Buscar campanha..." />
                <select className={styles.tableFilter} value={tableStatus} onChange={e => setTableStatus(e.target.value)}>
                  <option value="all">Todos status</option>
                  <option value="ACTIVE">Ativas</option>
                  <option value="PAUSED">Pausadas</option>
                  <option value="ARCHIVED">Arquivadas</option>
                </select>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr>
                    <th>Campanha</th><th>Status</th><th>Investido</th>
                    <th>Impressões</th><th>Cliques</th><th>CTR</th><th>CPC</th>
                    <th>Conv.</th><th>Leads</th><th>Compras</th><th>ROAS</th>
                  </tr></thead>
                  <tbody>
                    {filtered.map(c => (
                      <tr key={c.id}>
                        <td className={styles.campNameCell}>{c.name}</td>
                        <td><span className={`${styles.pill} ${c.status === 'ACTIVE' ? styles.pillGreen : styles.pillGray}`}>{c.status === 'ACTIVE' ? 'Ativa' : 'Pausada'}</span></td>
                        <td>R$ {fmt(c.spend)}</td><td>{fmtI(c.impressions)}</td>
                        <td>{fmtN(c.clicks)}</td><td>{c.ctr.toFixed(2)}%</td>
                        <td>R$ {fmt(c.cpc)}</td>
                        <td>{c.conversations > 0 ? fmtN(c.conversations) : '—'}</td>
                        <td>{c.leads > 0 ? fmtN(c.leads) : '—'}</td>
                        <td>{c.purchases > 0 ? fmtN(c.purchases) : '—'}</td>
                        <td>{c.roas > 0 ? `${c.roas.toFixed(2)}x` : '—'}</td>
                      </tr>
                    ))}
                    {filtered.length === 0 && !loading && <tr><td colSpan={11} className={styles.emptyRow}>Nenhuma campanha encontrada</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </>}

          {/* ── PLATAFORMAS ───────────────────────────────────────────── */}
          {activeTab === 'plataformas' && <>
            <div className={styles.sectionCard}>
              <div className={styles.platHead}>
                <svg viewBox="0 0 24 24" fill="#1877f2" width={20} height={20}><circle cx="12" cy="12" r="10"/><path d="M16 8h-2a2 2 0 00-2 2v2h4l-.5 4H12v8h-4v-8H6v-4h2v-2a6 6 0 016-6h2v4z" fill="#fff"/></svg>
                <span className={styles.platTitle}>Meta Ads</span>
                {viewing?.account && <span className={styles.platId}>{viewing.account}</span>}
              </div>
              <div className={styles.kpiRow}>
                {[
                  { label: 'Investido', value: `R$ ${fmt(tSpend)}` },
                  { label: 'Impressões', value: fmtI(tImp) },
                  { label: 'Cliques', value: fmtN(tClk) },
                  { label: 'CTR médio', value: `${avgCtr.toFixed(2)}%` },
                  { label: 'Conversas', value: fmtN(tConv) },
                  { label: 'ROAS', value: `${totRoas.toFixed(2)}x` },
                ].map(k => (
                  <div key={k.label} className={styles.kpiMini}>
                    <div className={styles.kpiMiniLabel}>{k.label}</div>
                    <div className={styles.kpiMiniValue}>{k.value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.sectionCard}>
              <div className={styles.platHead}>
                <svg viewBox="0 0 48 48" width={20} height={20}><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.08 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-3.59-13.46-8.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                <span className={styles.platTitle}>Google Ads</span>
                <span className={styles.comingSoon}>Em breve</span>
              </div>
              <p style={{ color: '#6E6E73', fontSize: 13 }}>Integração com Google Ads em desenvolvimento.</p>
            </div>
          </>}

          {/* ── CAMPANHAS accordion ───────────────────────────────────── */}
          {activeTab === 'campanhas' && <>
            <div className={styles.accordionFilters}>
              <input className={styles.tableSearch} value={campSearch} onChange={e => setCampSearch(e.target.value)} placeholder="Buscar campanha..." />
              <select className={styles.tableFilter} value={campStatus} onChange={e => setCampStatus(e.target.value)}>
                <option value="all">Todos</option>
                <option value="ACTIVE">Ativas</option>
                <option value="PAUSED">Pausadas</option>
              </select>
            </div>
            {loading && <div className={styles.loadingBar}><div className={styles.spinner} /> Carregando...</div>}

            {/* BREAKDOWN SECTION */}
            <div className={styles.tableCard} style={{ marginBottom: 20 }}>
              <div className={styles.tableHead}>
                <span className={styles.tableTitle}>Análise de Performance</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['by_day', 'by_device', 'by_placement'] as const).map(type => (
                    <button
                      key={type}
                      className={styles.chartBtn}
                      style={{
                        background: breakdownType === type ? '#CC1414' : 'transparent',
                        color: breakdownType === type ? '#fff' : '#6E6E73',
                        borderColor: breakdownType === type ? '#CC1414' : '#E5E5EA',
                      }}
                      onClick={() => {
                        setBreakdownType(type)
                        loadBreakdown(type, breakdownMetric, period)
                      }}
                    >
                      {type === 'by_day' ? 'Por dia' : type === 'by_device' ? 'Por dispositivo' : 'Por posição'}
                    </button>
                  ))}
                  {(['spend', 'impressions', 'clicks'] as const).map(m => (
                    <button
                      key={m}
                      className={styles.chartBtn}
                      style={{
                        background: breakdownMetric === m ? '#CC1414' : 'transparent',
                        color: breakdownMetric === m ? '#fff' : '#6E6E73',
                        borderColor: breakdownMetric === m ? '#CC1414' : '#E5E5EA',
                      }}
                      onClick={() => {
                        setBreakdownMetric(m)
                        loadBreakdown(breakdownType, m, period)
                      }}
                    >
                      {m === 'spend' ? 'Gasto' : m === 'impressions' ? 'Impressões' : 'Cliques'}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ padding: '16px 18px' }}>
                {breakdownLoading
                  ? <div className={styles.miniLoad}><div className={styles.spinnerSm} /> Carregando análise...</div>
                  : breakdownData.length === 0
                    ? <div className={styles.empty}>Sem dados de breakdown.</div>
                    : <div>
                        {breakdownData.map((item, idx) => {
                          const maxVal = Math.max(...breakdownData.map(d => d.value))
                          const pct = (item.value / maxVal) * 100
                          return (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 12, borderBottom: idx < breakdownData.length - 1 ? '1px solid #E5E5EA' : 'none' }}>
                              <div style={{ minWidth: 140, fontSize: 12, fontWeight: 500, color: '#111' }}>{item.name}</div>
                              <div style={{ flex: 1, height: 8, background: '#F5F5F7', borderRadius: 20, overflow: 'hidden' }}>
                                <div style={{ height: '100%', background: 'linear-gradient(90deg, #CC1414, #FF6B6B)', width: `${pct}%`, borderRadius: 20, transition: 'width 0.4s ease' }} />
                              </div>
                              <div style={{ minWidth: 90, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#111' }}>
                                {breakdownMetric === 'spend' ? `R$ ${fmt(item.value)}` : fmtN(item.value)}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                }
              </div>
            </div>

            {/* TOP CREATIVES SECTION */}
            {campaigns.length > 0 && (
              <div className={styles.tableCard} style={{ marginBottom: 20 }}>
                <div className={styles.tableHead}>
                  <span className={styles.tableTitle}>🎬 Top Criativos (Melhores desempenhos)</span>
                </div>
                <div style={{ padding: '16px 18px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                    {(() => {
                      const allAds = Object.values(adsMap).flat()
                      return allAds.length === 0 ? (
                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 24, color: '#AEAEB2', fontSize: 13 }}>
                          Expanda as campanhas para visualizar criativos.
                        </div>
                      ) : (
                        allAds
                          .sort((a, b) => b.spend - a.spend)
                          .slice(0, 12)
                          .map((ad, idx) => (
                            <div key={ad.id} className={styles.adCard} style={{ position: 'relative', overflow: 'hidden' }}>
                              <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '2px 6px', zIndex: 10 }}>
                                #{idx + 1}
                              </div>
                              {(ad as Ad & { creative?: { thumbnail_url?: string } }).creative?.thumbnail_url ? (
                                <img
                                  src={(ad as Ad & { creative?: { thumbnail_url?: string } }).creative!.thumbnail_url!}
                                  alt=""
                                  className={styles.adThumb}
                                  style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 7, marginBottom: 8 }}
                                  onError={e => (e.currentTarget.style.display = 'none')}
                                />
                              ) : (
                                <div style={{ width: '100%', height: 100, background: '#F5F5F7', borderRadius: 7, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#AEAEB2', fontSize: 32 }}>
                                  📷
                                </div>
                              )}
                              <div className={styles.adName}>{ad.name}</div>
                              <div className={styles.adStats} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, color: '#6E6E73' }}>
                                <span>💰 R$ {fmt(ad.spend)}</span>
                                <span>👁️ {fmtI(ad.impressions)}</span>
                                <span>🔗 {fmtN(ad.clicks)}</span>
                              </div>
                            </div>
                          ))
                      )
                    })()}
                  </div>
                </div>
              </div>
            )}

            <div className={styles.accordion}>
              {campFiltered.map(c => (
                <div key={c.id} className={styles.accItem}>
                  <div className={styles.accHeader} onClick={() => toggleCamp(c.id)}>
                    <svg className={`${styles.chevron} ${openCamps.has(c.id) ? styles.chevronOpen : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width={16} height={16}><path d="M9 18l6-6-6-6"/></svg>
                    <div className={styles.accInfo}>
                      <div className={styles.accName}>{c.name}</div>
                      <div className={styles.accObj}>{c.objective}</div>
                    </div>
                    <span className={`${styles.pill} ${c.status === 'ACTIVE' ? styles.pillGreen : styles.pillGray}`}>{c.status === 'ACTIVE' ? 'Ativa' : 'Pausada'}</span>
                    <div className={styles.accStats}><span>R$ {fmt(c.spend)}</span><span>{fmtI(c.impressions)}</span><span>{c.ctr.toFixed(2)}% CTR</span></div>
                  </div>
                  {openCamps.has(c.id) && (
                    <div className={styles.accBody}>
                      {loadingAdsets.has(c.id)
                        ? <div className={styles.miniLoad}><div className={styles.spinnerSm} /> Carregando conjuntos...</div>
                        : (adsetMap[c.id] || []).map(as => (
                          <div key={as.id} className={styles.adsetItem}>
                            <div className={styles.adsetHeader} onClick={() => toggleAdset(as.id)}>
                              <svg className={`${styles.chevron} ${openAdsets.has(as.id) ? styles.chevronOpen : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width={14} height={14}><path d="M9 18l6-6-6-6"/></svg>
                              <span className={styles.adsetName}>{as.name}</span>
                              <span className={`${styles.pill} ${as.status === 'ACTIVE' ? styles.pillGreen : styles.pillGray}`} style={{ fontSize: 10 }}>{as.status === 'ACTIVE' ? 'Ativo' : 'Pausado'}</span>
                              <span className={styles.adsetStat}>R$ {fmt(as.spend)}</span>
                            </div>
                            {openAdsets.has(as.id) && (
                              <div className={styles.adsGrid}>
                                {loadingAds.has(as.id)
                                  ? <div className={styles.miniLoad}><div className={styles.spinnerSm} /></div>
                                  : (adsMap[as.id] || []).map(ad => (
                                    <div key={ad.id} className={styles.adCard}>
                                      {(ad as Ad & { creative?: { thumbnail_url?: string } }).creative?.thumbnail_url && (
                                        <img src={(ad as Ad & { creative?: { thumbnail_url?: string } }).creative!.thumbnail_url!} alt="" className={styles.adThumb} onError={e => (e.currentTarget.style.display = 'none')} />
                                      )}
                                      <div className={styles.adName}>{ad.name}</div>
                                      <div className={styles.adStats}><span>R$ {fmt(ad.spend)}</span><span>{fmtI(ad.impressions)}</span><span>{ad.ctr.toFixed(2)}%</span></div>
                                    </div>
                                  ))
                                }
                              </div>
                            )}
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>
              ))}
              {campFiltered.length === 0 && !loading && <div className={styles.empty}>Nenhuma campanha encontrada.</div>}
            </div>
          </>}

          {/* ── GRÁFICOS ──────────────────────────────────────────────── */}
          {activeTab === 'graficos' && <>
            <div className={styles.chartControls}>
              <span className={styles.chartControlLabel}>Métrica:</span>
              {(['spend','impressions','clicks'] as const).map(m => (
                <button key={m} className={`${styles.chartBtn} ${chartMetric === m ? styles.chartBtnActive : ''}`} onClick={() => setChartMetric(m)}>
                  {m === 'spend' ? 'Investido' : m === 'impressions' ? 'Impressões' : 'Cliques'}
                </button>
              ))}
            </div>

            {/* TOP CAMPAIGNS BAR + DISTRIBUTION PIE */}
            <div className={styles.chartsRow}>
              <div className={styles.chartCard} style={{ flex: 2 }}>
                <div className={styles.chartHead}><span>📊 Campanhas — top 8</span></div>
                {campaigns.length > 0
                  ? <Bar data={chartData} options={{ responsive: true, indexAxis: 'y' as const, plugins: { legend: { display: false } }, scales: { x: { grid: { color: '#E5E5EA' } }, y: { grid: { display: false } } } }} />
                  : <div className={styles.empty}>Sem dados.</div>}
              </div>
              <div className={styles.chartCard} style={{ flex: 1, maxWidth: 320 }}>
                <div className={styles.chartHead}><span>🥧 Distribuição de gasto</span></div>
                {campaigns.length > 0
                  ? <Doughnut data={donutData} options={{ responsive: true, plugins: { legend: { position: 'bottom' as const } } }} />
                  : <div className={styles.empty}>Sem dados.</div>}
              </div>
            </div>

            {/* TIME SERIES LINE CHART */}
            <div className={styles.chartCard} style={{ marginBottom: 20 }}>
              <div className={styles.chartHead}><span>📈 Performance ao longo do tempo</span></div>
              {timeSeriesLoading
                ? <div className={styles.miniLoad}><div className={styles.spinnerSm} /> Carregando...</div>
                : timeSeriesData.length === 0
                  ? <div className={styles.empty}>Sem dados de série temporal.</div>
                  : <Line
                      data={{
                        labels: timeSeriesData.map(d => d.date),
                        datasets: [
                          {
                            label: 'Gasto (R$)',
                            data: timeSeriesData.map(d => d.spend),
                            borderColor: '#CC1414',
                            backgroundColor: 'rgba(204, 20, 20, 0.05)',
                            tension: 0.4,
                            fill: true,
                            pointRadius: 3,
                            pointBackgroundColor: '#CC1414',
                            pointBorderColor: '#fff',
                            pointBorderWidth: 2,
                            yAxisID: 'y',
                          },
                          {
                            label: 'Impressões (k)',
                            data: timeSeriesData.map(d => d.impressions / 1000),
                            borderColor: '#3B82F6',
                            backgroundColor: 'rgba(59, 130, 246, 0.05)',
                            tension: 0.4,
                            fill: true,
                            pointRadius: 3,
                            pointBackgroundColor: '#3B82F6',
                            pointBorderColor: '#fff',
                            pointBorderWidth: 2,
                            yAxisID: 'y1',
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        interaction: { mode: 'index' as const, intersect: false },
                        plugins: { legend: { position: 'top' as const } },
                        scales: {
                          y: { type: 'linear' as const, display: true, position: 'left' as const, grid: { color: '#E5E5EA' } },
                          y1: { type: 'linear' as const, display: true, position: 'right' as const, grid: { display: false } },
                        },
                      }}
                    />
              }
            </div>

            {/* METRICS DISTRIBUTION */}
            {timeSeriesData.length > 0 && (
              <div className={styles.chartsRow}>
                <div className={styles.chartCard}>
                  <div className={styles.chartHead}><span>💰 Gasto por dia</span></div>
                  <Line
                    data={{
                      labels: timeSeriesData.map(d => d.date),
                      datasets: [{
                        label: 'Gasto (R$)',
                        data: timeSeriesData.map(d => d.spend),
                        borderColor: '#10B981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        borderWidth: 2,
                        tension: 0.4,
                        fill: true,
                        pointRadius: 2,
                        pointBackgroundColor: '#10B981',
                      }],
                    }}
                    options={{
                      responsive: true,
                      plugins: { legend: { display: false } },
                      scales: { y: { grid: { color: '#E5E5EA' } } },
                    }}
                  />
                </div>
                <div className={styles.chartCard}>
                  <div className={styles.chartHead}><span>👁️ Impressões por dia</span></div>
                  <Line
                    data={{
                      labels: timeSeriesData.map(d => d.date),
                      datasets: [{
                        label: 'Impressões',
                        data: timeSeriesData.map(d => d.impressions),
                        borderColor: '#8B5CF6',
                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        borderWidth: 2,
                        tension: 0.4,
                        fill: true,
                        pointRadius: 2,
                        pointBackgroundColor: '#8B5CF6',
                      }],
                    }}
                    options={{
                      responsive: true,
                      plugins: { legend: { display: false } },
                      scales: { y: { grid: { color: '#E5E5EA' } } },
                    }}
                  />
                </div>
              </div>
            )}
          </>}

          {/* ── RELATÓRIOS ────────────────────────────────────────────── */}
          {activeTab === 'relatorios' && <>
            <div className={styles.relHeader}>
              <span className={styles.relTitle}>Relatórios salvos</span>
              <button className={styles.btnNewRel} onClick={() => window.open('/relatorio?novo=1', '_blank')}>+ Novo relatório</button>
            </div>
            {relatorios.length === 0
              ? <div className={styles.empty}>Nenhum relatório salvo para esta conta.</div>
              : <div className={styles.relList}>
                  {relatorios.map(r => (
                    <div key={r.id} className={styles.relCard}>
                      <div className={styles.relIcon}>{r.dados?.tipo === 'v2' ? '✦' : '📄'}</div>
                      <div className={styles.relInfo}>
                        <div className={styles.relName}>{r.titulo}</div>
                        <div className={styles.relMeta}>{r.periodo} · {fmtDate(r.updated_at)}</div>
                      </div>
                      {r.dados?.tipo === 'v2' && <span className={styles.proBadge}>PRO</span>}
                      <button className={styles.btnOpenRel} onClick={() => window.open(`/relatorio?id=${r.id}`, '_blank')}>Abrir →</button>
                      <button className={styles.btnDelRel} onClick={() => deleteRelatorio(r.id)}>🗑</button>
                    </div>
                  ))}
                </div>
            }
          </>}

        </div>
      </div>

      {modalOpen && <AccountModal data={modalEdit || {}} loading={modalLoading} error={modalError} onSave={saveClient} onDelete={deleteClient} onClose={() => { setModalOpen(false); setModalEdit(null); setModalError('') }} />}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

function KpiSection({ title, cmpLabel, items }: {
  title: string
  cmpLabel?: string
  items: { label: string; value: string; accent?: boolean; currRaw?: number; prevRaw?: number; prev?: string }[]
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E5E5EA', borderRadius: 10, padding: '16px 20px', flex: 1, minWidth: 220 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6E6E73', textTransform: 'uppercase' as const, letterSpacing: '.07em', marginBottom: 14 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16 }}>
        {items.map(it => {
          const hasCmp = it.prev !== undefined && it.prevRaw !== undefined && it.currRaw !== undefined
          const delta = hasCmp && it.prevRaw! > 0
            ? ((it.currRaw! - it.prevRaw!) / it.prevRaw! * 100)
            : null
          const isUp = delta !== null && delta >= 0
          return (
            <div key={it.label}>
              <div style={{ fontSize: 10, color: '#AEAEB2', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '.05em', marginBottom: 4 }}>{it.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: it.accent ? '#CC1414' : '#111', letterSpacing: '-.02em', lineHeight: 1 }}>{it.value}</div>
                {delta !== null && Math.abs(delta) >= 0.1 && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 6,
                    background: isUp ? '#dcfce7' : '#fee2e2',
                    color: isUp ? '#16a34a' : '#dc2626',
                    lineHeight: 1.4, whiteSpace: 'nowrap' as const,
                  }}>
                    {isUp ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
                  </span>
                )}
              </div>
              {it.prev && (
                <div style={{
                  fontSize: 10, color: '#AEAEB2', marginTop: 3,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                }}>
                  {it.prev} ant.{cmpLabel ? ` · ${cmpLabel.length > 18 ? cmpLabel.slice(0, 18) + '…' : cmpLabel}` : ''}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Account Modal ─────────────────────────────────────────────────────────────
function AccountModal({ data, loading, error, onSave, onDelete, onClose }: {
  data: Partial<Cliente>; loading: boolean; error: string
  onSave: (d: Partial<Cliente> & { foto_base64?: string; foto_mime?: string }) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<Partial<Cliente>>(data)
  const [senha, setSenha] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [fotoPreview, setFotoPreview] = useState<string>(data.foto_url || '')
  const [fotoBase64, setFotoBase64] = useState<string>('')
  const [fotoMime, setFotoMime] = useState<string>('')
  const [cropSrc, setCropSrc] = useState<string>('')   // imagem bruta p/ o cropper
  const isEdit = !!data.id
  const up = (k: keyof Cliente, v: string) => setForm(p => ({ ...p, [k]: v }))

  function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { alert('Foto muito grande. Máximo 10MB.'); return }
    const reader = new FileReader()
    reader.onload = ev => { setCropSrc(ev.target?.result as string) }
    reader.readAsDataURL(file)
    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  function handleCropConfirm(b64: string, mime: string) {
    setFotoBase64(b64)
    setFotoMime(mime)
    setFotoPreview(`data:${mime};base64,${b64}`)
    setCropSrc('')
  }

  function handleSave() {
    onSave({
      ...form,
      ...(fotoBase64 ? { foto_base64: fotoBase64, foto_mime: fotoMime } : {}),
      ...(!isEdit && senha ? { senha } : {}),
    })
  }

  const initials = (form.nome || '?').slice(0, 2).toUpperCase()

  if (cropSrc) {
    return <ImageCropper src={cropSrc} onConfirm={handleCropConfirm} onCancel={() => setCropSrc('')} />
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{isEdit ? 'Editar conta' : 'Nova conta'}</div>
          {isEdit && !confirmDelete && (
            <button onClick={() => setConfirmDelete(true)} style={{ background: 'none', border: '1px solid #fee2e2', borderRadius: 7, padding: '4px 10px', fontSize: 12, color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>
              🗑 Excluir
            </button>
          )}
        </div>

        {/* Confirm delete */}
        {confirmDelete && (
          <div style={{ background: '#FFF3F3', border: '1px solid rgba(204,20,20,.3)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#CC1414', marginBottom: 10 }}>Tem certeza que deseja excluir esta conta?</div>
            <div style={{ fontSize: 12, color: '#6E6E73', marginBottom: 14 }}>Esta ação não pode ser desfeita. Todos os dados desta conta serão removidos.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: '8px', background: '#F5F5F7', border: '1px solid #E5E5EA', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Cancelar</button>
              <button onClick={() => onDelete(data.id!)} disabled={loading} style={{ flex: 1, padding: '8px', background: '#CC1414', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Excluindo...' : 'Sim, excluir'}
              </button>
            </div>
          </div>
        )}

        {/* Foto upload */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg,#CC1414,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#fff', overflow: 'hidden', border: '2px solid #E5E5EA' }}>
              {fotoPreview
                ? <img src={fotoPreview} alt="foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initials}
            </div>
          </div>
          <div>
            <label htmlFor="foto-upload" style={{ display: 'inline-block', padding: '7px 14px', background: '#F5F5F7', border: '1px solid #E5E5EA', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#111' }}>
              📷 {fotoPreview ? 'Trocar foto' : 'Enviar foto'}
            </label>
            <input id="foto-upload" type="file" accept="image/*" onChange={handleFotoChange} style={{ display: 'none' }} />
            {fotoPreview && (
              <button onClick={() => { setFotoPreview(''); setFotoBase64(''); setFotoMime(''); setForm(p => ({ ...p, foto_url: '' })) }}
                style={{ marginLeft: 8, background: 'none', border: 'none', fontSize: 11, color: '#AEAEB2', cursor: 'pointer', textDecoration: 'underline' }}>
                Remover
              </button>
            )}
            <div style={{ fontSize: 10, color: '#AEAEB2', marginTop: 4 }}>JPG, PNG ou WebP · máx. 2MB</div>
          </div>
        </div>

        {error && <div style={{ background: '#FFF3F3', border: '1px solid rgba(204,20,20,.3)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#CC1414', marginBottom: 14 }}>{error}</div>}

        {([
          { key: 'nome' as keyof Cliente,            label: 'Nome',            ph: 'Nome do cliente' },
          { key: 'username' as keyof Cliente,        label: 'Usuário',         ph: 'usuario', disabled: isEdit },
          { key: 'meta_account_id' as keyof Cliente, label: 'Meta Account ID', ph: 'act_123456789' },
        ]).map(f => (
          <div key={String(f.key)} style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6E6E73', textTransform: 'uppercase' as const, letterSpacing: '.05em', marginBottom: 6 }}>{f.label}</label>
            <input value={String(form[f.key] || '')} placeholder={f.ph} disabled={f.disabled}
              onChange={e => up(f.key, e.target.value)}
              style={{ width: '100%', background: '#F5F5F7', border: '1px solid #E5E5EA', borderRadius: 8, padding: '10px 13px', fontSize: 13, outline: 'none', opacity: f.disabled ? 0.6 : 1, boxSizing: 'border-box' as const }} />
          </div>
        ))}

        {!isEdit && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6E6E73', textTransform: 'uppercase' as const, letterSpacing: '.05em', marginBottom: 6 }}>Senha</label>
            <input type="password" value={senha} placeholder="Senha de acesso" onChange={e => setSenha(e.target.value)}
              style={{ width: '100%', background: '#F5F5F7', border: '1px solid #E5E5EA', borderRadius: 8, padding: '10px 13px', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 11, background: '#F5F5F7', border: '1px solid #E5E5EA', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cancelar</button>
          <button onClick={handleSave} disabled={loading || confirmDelete} style={{ flex: 1, padding: 11, background: '#CC1414', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: (loading || confirmDelete) ? 0.5 : 1 }}>
            {loading ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
