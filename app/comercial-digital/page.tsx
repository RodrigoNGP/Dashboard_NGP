'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import NGPLoading from '@/components/NGPLoading'
import { getSession } from '@/lib/auth'
import CustomSelect, { SelectOption } from '@/components/CustomSelect'
import { SURL } from '@/lib/constants'
import { efHeaders } from '@/lib/api'
import { comercialDigitalNav } from './comercial-digital-nav'
import { buildClientPortalNav } from '@/app/cliente/client-nav'
import { crmCall, CrmLead, CrmPipeline, CrmStage, CrmTask, TASK_PRIORITY_LABELS, TASK_TYPE_LABELS } from '@/lib/crm-api'
import styles from './comercial-digital.module.css'

interface ClienteCrm {
  id: string
  nome: string
  username: string
  email: string
  role: 'cliente'
  ativo: boolean
  created_at: string
  analytics_enabled: boolean
  reports_enabled: boolean
  crm_enabled: boolean
  crm_pipeline_count: number
  crm_pipeline_name?: string | null
}

export default function ComercialDigitalPage() {
  const router = useRouter()
  const listRef = useRef<HTMLElement | null>(null)
  const [sess, setSess] = useState<ReturnType<typeof getSession> | null>(null)
  const [clientes, setClientes] = useState<ClienteCrm[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingClientCrm, setLoadingClientCrm] = useState(false)
  const [clientHasCrm, setClientHasCrm] = useState(false)
  const [clientAnalyticsEnabled, setClientAnalyticsEnabled] = useState(false)
  const [clientReportsEnabled, setClientReportsEnabled] = useState(false)
  const [clientPipelines, setClientPipelines] = useState<CrmPipeline[]>([])
  const [dashboardPipelineId, setDashboardPipelineId] = useState('')
  const [dashboardStages, setDashboardStages] = useState<CrmStage[]>([])
  const [dashboardLeads, setDashboardLeads] = useState<CrmLead[]>([])
  const [dashboardTasks, setDashboardTasks] = useState<CrmTask[]>([])
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [taskFilter, setTaskFilter] = useState<'todas' | 'pendente' | 'atrasada' | 'concluida'>('pendente')
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [selectionPrompt, setSelectionPrompt] = useState<string | null>(null)

  useEffect(() => {
    const s = getSession()
    if (!s || s.auth !== '1') { router.replace('/login'); return }
    if (!['admin', 'ngp', 'cliente'].includes(s.role)) { router.replace('/login'); return }
    setSess(s)
  }, [router])

  const isAdmin = sess?.role === 'admin'
  const isClient = sess?.role === 'cliente'

  const loadClientes = useCallback(async () => {
    const s = getSession()
    if (!s?.session || s.role !== 'admin') { setLoading(false); return }
    setLoading(true)
    try {
      const res = await fetch(`${SURL}/functions/v1/admin-listar-clientes-central`, {
        method: 'POST',
        headers: efHeaders(),
        body: JSON.stringify({ session_token: s.session }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Erro ao carregar clientes.')
      setClientes((data.clientes || [])
        .filter((usuario: ClienteCrm) => usuario.crm_enabled)
        .sort((a: ClienteCrm, b: ClienteCrm) => a.nome.localeCompare(b.nome)))
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Erro ao carregar clientes.' })
    } finally {
      setLoading(false)
    }
  }, [])

  const loadClientCrmAccess = useCallback(async () => {
    const s = getSession()
    if (!s?.session || s.role !== 'cliente') return
    setLoadingClientCrm(true)
    try {
      const res = await fetch(`${SURL}/functions/v1/cliente-portal-access`, {
        method: 'POST',
        headers: efHeaders(),
        body: JSON.stringify({ session_token: s.session }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Erro ao verificar o CRM do cliente.')
      setClientHasCrm(!!data.access?.crm_enabled)
      setClientAnalyticsEnabled(!!data.access?.analytics_enabled)
      setClientReportsEnabled(!!data.access?.reports_enabled)
    } catch {
      setClientHasCrm(false)
      setClientAnalyticsEnabled(false)
      setClientReportsEnabled(false)
    } finally {
      setLoadingClientCrm(false)
    }
  }, [])

  const loadClientDashboard = useCallback(async (forcedPipelineId?: string) => {
    const s = getSession()
    if (!s?.session || s.role !== 'cliente') return
    setDashboardLoading(true)
    try {
      const list = await crmCall('crm-manage-pipeline', { action: 'list' })
      if (list.error) throw new Error(list.error)

      const pipelines: CrmPipeline[] = list.pipelines || []
      setClientPipelines(pipelines)

      const targetPipelineId = forcedPipelineId || dashboardPipelineId || pipelines[0]?.id || ''
      setDashboardPipelineId(targetPipelineId)

      if (!targetPipelineId) {
        setDashboardStages([])
        setDashboardLeads([])
        setDashboardTasks([])
        return
      }

      const full = await crmCall('crm-manage-pipeline', {
        action: 'get_full_data',
        pipeline_id: targetPipelineId,
      })
      if (full.error) throw new Error(full.error)

      setDashboardStages(full.stages || [])
      setDashboardLeads(full.leads || [])
      setDashboardTasks(full.tasks || [])
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Erro ao carregar dashboard comercial.' })
    } finally {
      setDashboardLoading(false)
    }
  }, [dashboardPipelineId])

  useEffect(() => {
    if (sess?.role === 'admin') loadClientes()
    if (sess?.role === 'cliente') loadClientCrmAccess()
    if (sess?.role !== 'admin') setLoading(false)
  }, [sess, loadClientes, loadClientCrmAccess])

  useEffect(() => {
    if (sess?.role === 'cliente' && clientHasCrm) {
      loadClientDashboard()
    }
  }, [sess, clientHasCrm, loadClientDashboard])

  function showMsg(type: 'ok' | 'err', text: string) {
    setMsg({ type, text })
    window.setTimeout(() => setMsg(null), 5000)
  }

  const clientPortalNav = buildClientPortalNav({
    analyticsEnabled: clientAnalyticsEnabled,
    reportsEnabled: clientReportsEnabled,
    crmEnabled: clientHasCrm,
  })

  const isOverdueTask = useCallback((task: CrmTask) => {
    if (task.status === 'concluida') return false
    const due = new Date(task.due_date)
    const today = new Date()
    due.setHours(0, 0, 0, 0)
    today.setHours(0, 0, 0, 0)
    return due < today
  }, [])

  const isTodayTask = useCallback((task: CrmTask) => {
    const due = new Date(task.due_date)
    const today = new Date()
    return due.toDateString() === today.toDateString()
  }, [])

  const fmtTaskDate = useCallback((iso: string) => {
    const d = new Date(iso)
    const today = new Date()
    if (d.toDateString() === today.toDateString()) return 'Hoje'
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    if (d.toDateString() === tomorrow.toDateString()) return 'Amanhã'
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    if (d.toDateString() === yesterday.toDateString()) return 'Ontem'
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  }, [])

  const filteredTasks = useMemo(() => {
    if (taskFilter === 'pendente') return dashboardTasks.filter((task) => task.status === 'pendente')
    if (taskFilter === 'concluida') return dashboardTasks.filter((task) => task.status === 'concluida')
    if (taskFilter === 'atrasada') return dashboardTasks.filter((task) => isOverdueTask(task))
    return dashboardTasks
  }, [dashboardTasks, isOverdueTask, taskFilter])

  const completeTask = useCallback(async (taskId: string) => {
    const res = await crmCall('crm-manage-tasks', { action: 'complete', task_id: taskId })
    if (res.error) {
      showMsg('err', res.error)
      return
    }
    setDashboardTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? { ...task, status: 'concluida', completed_at: new Date().toISOString() }
          : task
      )
    )
  }, [])

  const todayCount = dashboardTasks.filter((task) => task.status === 'pendente' && isTodayTask(task)).length
  const overdueCount = dashboardTasks.filter((task) => isOverdueTask(task)).length
  const pendingCount = dashboardTasks.filter((task) => task.status === 'pendente').length
  const doneCount = dashboardTasks.filter((task) => task.status === 'concluida').length

  if (!sess) return <NGPLoading loading loadingText="Carregando comercial digital..." />

  return (
    <div className={styles.layout}>
      <Sidebar
        minimal
        sectorNavTitle="COMERCIAL DIGITAL"
        sectorNav={isClient ? clientPortalNav : comercialDigitalNav}
        activeTab="dashboard"
        onTabChange={(tab) => {
          if (isClient) {
            if (tab === 'analytics') router.push('/cliente/relatorios')
            else if (tab === 'dashboard') router.push('/comercial-digital')
            else if (tab === 'crm') router.push('/comercial-digital')
            else if (tab === 'kanban') router.push('/comercial-digital/pipeline?tab=kanban')
            else if (tab === 'funil') router.push('/comercial-digital/pipeline?tab=funil')
            else if (tab === 'fields') router.push('/comercial-digital/pipeline?tab=fields')
            else if (tab === 'new_pipeline') router.push('/comercial-digital/pipeline?action=new_pipeline')
            return
          }

          if (tab === 'dashboard') {
            router.push('/comercial-digital')
            return
          }

          if (tab === 'fields' || tab === 'kanban' || tab === 'new_pipeline' || tab === 'funil') {
            const labels: Record<string, string> = {
              fields: 'Campos',
              kanban: 'Meu CRM',
              funil: 'Funil',
              new_pipeline: 'Novo Funil',
            }
            setSelectionPrompt(labels[tab] || 'esta área')
            listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        }}
      />

      <main className={styles.main}>
        <div className={styles.content}>
          {!isClient && (
            <header className={styles.header}>
              <div className={styles.eyebrow}>Setor · Comercial Digital</div>
              <h1 className={styles.title}>CRM para clientes</h1>
              <p className={styles.subtitle}>
                Área dedicada para criar clientes, entregar acesso ao CRM e acompanhar pipelines digitais com separação por conta.
              </p>
            </header>
          )}

          {msg && (
            <div className={`${styles.msg} ${msg.type === 'ok' ? styles.msgOk : styles.msgErr}`}>
              {msg.text}
            </div>
          )}

          {isClient ? (
            <>
              <div className={styles.eyebrow}>Setor · Comercial Digital</div>
              <h1 className={styles.title}>Gestão do CRM</h1>
              <p className={styles.subtitle}>Visão geral de tarefas e atividades do seu CRM.</p>

              <div className={styles.dashboardToolbar}>
                <div className={styles.pipelineControl}>
                  <span className={styles.metricLabel}>Funil analisado</span>
                  {clientPipelines.length > 0 ? (
                    <CustomSelect
                      caption="Funil analisado"
                      value={dashboardPipelineId}
                      options={clientPipelines.map(p => ({ id: p.id, label: p.name }))}
                      onChange={(nextId) => {
                        setDashboardPipelineId(nextId)
                        loadClientDashboard(nextId)
                      }}
                    />
                  ) : (
                    <CustomSelect
                      caption="Funil analisado"
                      value=""
                      options={[]}
                      placeholder="Nenhum funil liberado"
                      onChange={() => {}}
                      disabled
                    />
                  )}
                </div>

                <button
                  className={styles.primaryBtn}
                  onClick={() => router.push('/comercial-digital/pipeline?tab=kanban')}
                  disabled={!clientHasCrm || loadingClientCrm}
                >
                  Abrir meu CRM
                </button>
              </div>

              <div className={styles.statsCard}>
                <div className={styles.statItem}>
                  <div className={styles.statNumber}>{todayCount}</div>
                  <div className={styles.statLabel}>Para hoje</div>
                </div>
                <div className={styles.statDivider} />
                <div className={styles.statItem}>
                  <div className={`${styles.statNumber} ${overdueCount > 0 ? styles.statDanger : ''}`}>{overdueCount}</div>
                  <div className={styles.statLabel}>Atrasadas</div>
                </div>
                <div className={styles.statDivider} />
                <div className={styles.statItem}>
                  <div className={styles.statNumber}>{pendingCount}</div>
                  <div className={styles.statLabel}>Pendentes</div>
                </div>
                <div className={styles.statDivider} />
                <div className={styles.statItem}>
                  <div className={`${styles.statNumber} ${styles.statSuccess}`}>{doneCount}</div>
                  <div className={styles.statLabel}>Concluídas</div>
                </div>
              </div>

              <div className={styles.filterRow}>
                {[
                  { key: 'pendente', label: 'Pendentes' },
                  { key: 'atrasada', label: 'Atrasadas' },
                  { key: 'concluida', label: 'Concluídas' },
                  { key: 'todas', label: 'Todas' },
                ].map((item) => (
                  <button
                    key={item.key}
                    className={`${styles.filterBtn} ${taskFilter === item.key ? styles.filterBtnActive : ''}`}
                    onClick={() => setTaskFilter(item.key as typeof taskFilter)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <section className={styles.taskListWrap}>
                {dashboardLoading ? (
                  <div className={styles.emptyState}>
                    <div className={styles.spinner} />
                    <p>Carregando tarefas...</p>
                  </div>
                ) : filteredTasks.length === 0 ? (
                  <div className={styles.emptyState}>
                    <p className={styles.emptyTitle}>Nenhuma tarefa encontrada</p>
                    <p className={styles.emptyDesc}>Crie tarefas nos leads do pipeline para vê-las aqui.</p>
                  </div>
                ) : (
                  filteredTasks.map((task) => {
                    const typeMeta = TASK_TYPE_LABELS[task.task_type] || { label: task.task_type, icon: '' }
                    const priorityMeta = TASK_PRIORITY_LABELS[task.priority] || TASK_PRIORITY_LABELS.normal
                    const overdue = isOverdueTask(task)
                    const today = isTodayTask(task)
                    const done = task.status === 'concluida'

                    return (
                      <div key={task.id} className={`${styles.taskItem} ${overdue ? styles.taskOverdue : ''} ${done ? styles.taskDone : ''}`}>
                        <button
                          className={`${styles.taskCheckbox} ${done ? styles.taskCheckboxDone : ''}`}
                          onClick={() => !done && completeTask(task.id)}
                          title={done ? 'Concluída' : 'Marcar como concluída'}
                        >
                          {done && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                        <div className={styles.taskBody}>
                          <div className={styles.taskTitleRow}>
                            <span className={styles.taskTitle} style={{ textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.45 : 1 }}>
                              {task.title}
                            </span>
                            {task.lead_company_name && (
                              <span className={styles.taskLeadBadge}>{task.lead_company_name}</span>
                            )}
                          </div>
                          <div className={styles.taskMetaRow}>
                            <span className={styles.taskType}>{typeMeta.label}</span>
                            <span className={styles.taskDot}>·</span>
                            <span className={styles.taskDate} style={{ color: overdue ? '#dc2626' : today ? '#d97706' : '#6B7280' }}>
                              {overdue ? 'Atrasada · ' : ''}{fmtTaskDate(task.due_date)}{task.due_time ? ` às ${task.due_time}` : ''}
                            </span>
                            <span className={styles.taskDot}>·</span>
                            <span className={styles.taskPrio} style={{ color: priorityMeta.color }}>
                              {priorityMeta.label}
                            </span>
                            {task.assigned_to_name && (
                              <>
                                <span className={styles.taskDot}>·</span>
                                <span className={styles.taskAssignee}>{task.assigned_to_name}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </section>
            </>
          ) : (
            <section className={styles.heroGrid}>
            <article className={styles.heroCard}>
              <div className={styles.heroTag}>Setor novo</div>
              <h2>Comercial Digital</h2>
              <p>
                Estrutura separada do comercial interno da NGP, pensada para usar o mesmo login do cliente e liberar um CRM isolado por conta.
              </p>
              <div className={styles.heroActions}>
                {isClient ? (
                  <button
                    className={styles.primaryBtn}
                    onClick={() => router.push('/comercial-digital/pipeline')}
                    disabled={!clientHasCrm || loadingClientCrm}
                  >
                    {loadingClientCrm ? 'Verificando acesso...' : clientHasCrm ? 'Abrir meu CRM' : 'CRM aguardando liberação'}
                  </button>
                ) : (
                  <button
                    className={styles.primaryBtn}
                    onClick={() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  >
                    Selecionar cliente abaixo
                  </button>
                )}
              </div>
            </article>

            <article className={styles.metricCard}>
              <span className={styles.metricLabel}>Acesso</span>
              <strong>{isClient ? 'Cliente final' : isAdmin ? 'Admin total' : 'Equipe NGP'}</strong>
              <p>
                {isClient
                  ? (clientHasCrm
                    ? 'Seu login atual já abre apenas o CRM vinculado à sua conta.'
                    : 'Seu login continua o mesmo. O CRM só aparece depois que a NGP liberar a sua conta.')
                  : 'O cliente usa o mesmo login que já acessa relatórios e só enxerga o CRM vinculado à própria conta.'}
              </p>
            </article>
          </section>
          )}

          {isAdmin && (
            <section className={styles.listCard} ref={listRef}>
              <div className={styles.listHeader}>
                <h3>Clientes com CRM liberado</h3>
                <span>{loading ? 'Carregando...' : `${clientes.length} cliente(s)`}</span>
              </div>

              {loading ? (
                <div className={styles.empty}>Carregando clientes...</div>
              ) : clientes.length === 0 ? (
                <div className={styles.empty}>Nenhum cliente com CRM liberado foi encontrado ainda.</div>
              ) : (
                <div className={styles.clientGrid}>
                  {clientes.map((cliente) => (
                    <button
                      key={cliente.id}
                      className={styles.clientCard}
                      onClick={() => router.push(`/comercial-digital/pipeline?cliente_id=${cliente.id}&cliente_nome=${encodeURIComponent(cliente.nome)}`)}
                    >
                      <div>
                        <strong>{cliente.nome}</strong>
                        <span>@{cliente.username} · {cliente.crm_pipeline_name || `${cliente.crm_pipeline_count} funil(is)`}</span>
                      </div>
                      <span className={styles.clientAction}>Abrir / configurar CRM →</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </main>

      {selectionPrompt && (
        <div className={styles.modalOverlay} onClick={() => setSelectionPrompt(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalEyebrow}>Seleção necessária</div>
            <h3>Escolha um cliente antes de continuar</h3>
            <p>
              Selecione um cliente para poder acessar <strong>{selectionPrompt}</strong>. Assim o CRM digital abre no
              contexto correto e evita qualquer mistura entre contas.
            </p>
            <div className={styles.modalActions}>
              <button className={styles.secondaryBtn} onClick={() => setSelectionPrompt(null)}>Fechar</button>
              <button
                className={styles.primaryBtn}
                onClick={() => {
                  listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  setSelectionPrompt(null)
                }}
              >
                Selecionar cliente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
