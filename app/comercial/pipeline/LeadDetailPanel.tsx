'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { crmCall, CrmLead, CrmStage, CrmPipelineField, CrmTask } from '@/lib/crm-api'
import ActivityTimeline from './ActivityTimeline'
import TaskList from './TaskList'
import RegisterActivityForm from './RegisterActivityForm'
import { formatCnpj } from './CnpjLookup'
import styles from './pipeline.module.css'

type Tab = 'dados' | 'timeline' | 'tarefas' | 'ia'

interface Props {
  lead: CrmLead
  stages: CrmStage[]
  pipelineFields: CrmPipelineField[]
  initialTab?: Tab
  open: boolean
  onClose: () => void
  onUpdate: (lead: CrmLead) => void
  onDelete: (leadId: string) => void
}

const getBaseType = (type: string) => type.split(':')[0]
const getFieldWidth = (type: string): 'full' | 'half' => type.includes(':half') ? 'half' : 'full'
const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

const CurrencyInput = ({ value, onChange, className }: { value: number | string; onChange: (v: number) => void; className?: string }) => {
  const displayVal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0)
  return (
    <input
      type="text"
      className={className}
      value={displayVal}
      onChange={(e) => {
        const numericStr = e.target.value.replace(/\D/g, '')
        const floatValue = numericStr ? parseInt(numericStr, 10) / 100 : 0
        onChange(floatValue)
      }}
    />
  )
}

// ── Temperatura Badge ──────────────────────────────────────────────────────────
function TempBadge({ temp }: { temp?: 'hot' | 'warm' | 'cold' }) {
  if (!temp) return null
  const map = {
    hot:  { emoji: '🔥', label: 'Quente',  color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
    warm: { emoji: '🌡️', label: 'Morno',   color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
    cold: { emoji: '❄️', label: 'Frio',    color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  }
  const t = map[temp]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: t.bg, color: t.color, border: `1px solid ${t.border}` }}>
      {t.emoji} {t.label}
    </span>
  )
}

// ── AI Advisor Tab ─────────────────────────────────────────────────────────────
function AIAdvisorTab({ lead, currentStageName }: { lead: CrmLead; currentStageName: string }) {
  const [advice, setAdvice]     = useState('')
  const [loading, setLoading]   = useState(false)
  const [cached, setCached]     = useState(false)
  const [cachedAt, setCachedAt] = useState('')
  const [error, setError]       = useState('')

  const fetchAdvice = useCallback(async (force = false) => {
    setLoading(true)
    setError('')
    const res = await crmCall('crm-ai-advisor', { action: 'advise', lead_id: lead.id, force_refresh: force })
    setLoading(false)
    if (res.error) {
      setError(res.error)
      return
    }
    setAdvice(res.advice || '')
    setCached(res.cached || false)
    setCachedAt(res.created_at ? new Date(res.created_at).toLocaleString('pt-BR') : '')
  }, [lead.id])

  // Carrega automaticamente ao abrir a aba
  useEffect(() => {
    fetchAdvice(false)
  }, [fetchAdvice])

  return (
    <div className={styles.aiAdvisorWrap}>
      <div className={styles.aiAdvisorHeader}>
        <div>
          <div className={styles.aiAdvisorTitle}>🤖 Advisor de IA</div>
          <div className={styles.aiAdvisorSubtitle}>
            Análise personalizada para <strong>{lead.company_name}</strong> na etapa <strong>{currentStageName}</strong>
          </div>
        </div>
        <button
          className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`}
          onClick={() => fetchAdvice(true)}
          disabled={loading}
          title="Gerar nova análise (consome crédito de IA)"
        >
          {loading ? '⏳' : '↻'} {loading ? 'Analisando...' : 'Atualizar'}
        </button>
      </div>

      {cached && cachedAt && (
        <div className={styles.aiCacheBadge}>
          💾 Análise em cache · gerada em {cachedAt}
        </div>
      )}

      {error && (
        <div className={styles.aiError}>{error}</div>
      )}

      {!error && !loading && !advice && (
        <div className={styles.aiEmptyState}>
          Clique em <strong>Atualizar</strong> para gerar a análise ou aguarde o carregamento automático.
        </div>
      )}

      {loading && !advice && (
        <div className={styles.aiLoading}>
          <div className={styles.aiLoadingSpinner} />
          <span>Consultando IA... pode levar alguns segundos</span>
        </div>
      )}

      {advice && (
        <div className={styles.aiAdviceBox}>
          {advice.split('\n').map((line, i) => {
            if (!line.trim()) return <br key={i} />
            // Renderiza markdown bold (**texto**)
            const parts = line.split(/(\*\*[^*]+\*\*)/)
            return (
              <p key={i} style={{ margin: '0 0 8px' }}>
                {parts.map((part, j) =>
                  part.startsWith('**') && part.endsWith('**')
                    ? <strong key={j}>{part.slice(2, -2)}</strong>
                    : part
                )}
              </p>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Stage Notes Entry type ────────────────────────────────────────────────────
interface StageNoteEntry {
  text: string
  created_at: string
}

// Lê stage_notes tolerando tanto string (legado) quanto array (novo formato)
function parseStageEntries(raw: any): StageNoteEntry[] {
  if (!raw) return []
  if (typeof raw === 'string') {
    if (!raw.trim()) return []
    return [{ text: raw, created_at: new Date().toISOString() }]
  }
  if (Array.isArray(raw)) return raw as StageNoteEntry[]
  return []
}

// ── Stage Notes Section ────────────────────────────────────────────────────────
function StageNotesSection({ lead, currentStageId, currentStageName, onSave, onActivityLogged }: {
  lead: CrmLead
  currentStageId: string
  currentStageName: string
  onSave: (stageNotes: Record<string, any>) => void
  onActivityLogged: () => void
}) {
  const [draft, setDraft]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [entries, setEntries] = useState<StageNoteEntry[]>([])
  const listRef               = useRef<HTMLDivElement>(null)

  // Carrega entradas da etapa atual
  useEffect(() => {
    const raw = (lead.stage_notes || {} as any)[currentStageId]
    setEntries(parseStageEntries(raw))
    setDraft('')
  }, [currentStageId, lead.stage_notes])

  // Scroll automático para última entrada
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [entries])

  const submit = async () => {
    const text = draft.trim()
    if (!text || saving) return
    setSaving(true)
    setDraft('')
    const newEntry: StageNoteEntry = { text, created_at: new Date().toISOString() }
    const newEntries = [...entries, newEntry]
    setEntries(newEntries)
    const newNotes = { ...(lead.stage_notes || {} as any), [currentStageId]: newEntries }
    // Salva notas + registra na timeline em paralelo
    await Promise.all([
      onSave(newNotes),
      crmCall('crm-manage-activities', {
        action: 'log_auto',
        lead_id: lead.id,
        activity_type: 'nota_interna',
        title: text.length > 80 ? text.slice(0, 80) + '…' : text,
        metadata: { stage_name: currentStageName },
      }),
    ])
    setSaving(false)
    onActivityLogged()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const fmtDate = (iso: string) => {
    const d = new Date(iso)
    if (d.getFullYear() < 2000) return '' // legado sem data
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className={styles.stageNotesWrap}>
      <div className={styles.stageNotesHeader}>
        <span className={styles.stageNotesLabel}>📝 Notas da etapa · <em>{currentStageName}</em></span>
        {saving && <span className={styles.stageNotesSaving}>salvando...</span>}
      </div>

      {/* Histórico de entradas */}
      {entries.length > 0 && (
        <div className={styles.stageNotesList} ref={listRef}>
          {entries.map((e, i) => (
            <div key={i} className={styles.stageNoteEntry}>
              <p className={styles.stageNoteEntryText}>{e.text}</p>
              {fmtDate(e.created_at) && (
                <span className={styles.stageNoteEntryDate}>{fmtDate(e.created_at)}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Input de nova nota */}
      <div className={styles.stageNotesInputWrap}>
        <textarea
          className={styles.stageNotesTextarea}
          placeholder={`Adicionar atualização em "${currentStageName}"... (Enter para salvar, Shift+Enter para nova linha)`}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
        />
        <button
          className={styles.stageNotesSendBtn}
          onClick={submit}
          disabled={!draft.trim() || saving}
          title="Salvar nota (Enter)"
        >
          ↵
        </button>
      </div>
    </div>
  )
}

export default function LeadDetailPanel({ lead, stages, pipelineFields, initialTab, open, onClose, onUpdate, onDelete }: Props) {
  const [tab, setTab]           = useState<Tab>(initialTab || 'dados')
  const [editLead, setEditLead] = useState<CrmLead>(lead)
  const [customFields, setCustomFields] = useState<Record<string, any>>(lead.custom_data || {})
  const [saving, setSaving]     = useState(false)
  const [toast, setToast]       = useState('')
  const [taskCount, setTaskCount] = useState<{ pending: number; overdue: number }>({ pending: 0, overdue: 0 })
  const [timelineKey, setTimelineKey] = useState(0)

  // Sync when lead changes (e.g. after drag-drop)
  useEffect(() => {
    setEditLead(lead)
    setCustomFields(lead.custom_data || {})
  }, [lead])

  // Load task counts for badges
  const loadTaskCounts = useCallback(async () => {
    const res = await crmCall('crm-manage-tasks', { action: 'list', lead_id: lead.id })
    if (!res.error && res.tasks) {
      const tasks = res.tasks as CrmTask[]
      const today = new Date().toDateString()
      const pending = tasks.filter((t: CrmTask) => t.status === 'pendente').length
      const overdue = tasks.filter((t: CrmTask) => t.status === 'pendente' && new Date(t.due_date) < new Date(today)).length
      setTaskCount({ pending, overdue })
    }
  }, [lead.id])

  useEffect(() => {
    if (open) {
      if (initialTab) setTab(initialTab)
      loadTaskCounts()
    }
  }, [open, initialTab, loadTaskCounts])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  // Utilitário: registra atividade de sistema e recarrega timeline
  const logActivity = useCallback(async (activity_type: string, title: string, metadata?: Record<string, any>) => {
    await crmCall('crm-manage-activities', {
      action: 'log_auto',
      lead_id: editLead.id,
      activity_type,
      title,
      metadata: metadata || {},
    })
    setTimelineKey(k => k + 1)
  }, [editLead.id])

  const saveLead = async () => {
    if (saving) return
    setSaving(true)
    const res = await crmCall('crm-manage-leads', {
      action: 'update', lead_id: editLead.id,
      company_name: editLead.company_name, contact_name: editLead.contact_name,
      email: editLead.email, phone: editLead.phone,
      estimated_value: editLead.estimated_value,
      notes: editLead.notes, source: editLead.source, custom_data: customFields,
    })
    setSaving(false)
    if (res.error) { showToast(`Erro: ${res.error}`); return }
    onUpdate(res.lead as CrmLead)
    showToast('Lead atualizado!')
    // Log na timeline
    logActivity('edicao_campo', `Dados do lead atualizados`)
  }

  // Salva notas da etapa (chamado pelo StageNotesSection)
  const saveStageNotes = async (newNotes: Record<string, any>) => {
    const res = await crmCall('crm-manage-leads', {
      action: 'update', lead_id: editLead.id, stage_notes: newNotes,
    })
    if (!res.error && res.lead) {
      const updatedLead = { ...editLead, stage_notes: newNotes }
      setEditLead(updatedLead)
      onUpdate(res.lead as CrmLead)
    }
  }

  const deleteLead = async () => {
    if (!confirm(`Excluir "${editLead.company_name}"?`)) return
    const res = await crmCall('crm-manage-leads', { action: 'delete', lead_id: editLead.id })
    if (res.error) { showToast(`Erro: ${res.error}`); return }
    onDelete(editLead.id)
    onClose()
  }

  const currentStage = stages.find(s => s.id === editLead.stage_id)

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div className={styles.drawerBackdrop} onClick={onClose} />

      {/* Drawer */}
      <div className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`}>
        {/* Header */}
        <div className={styles.drawerHeader}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={styles.drawerCompany}>{editLead.company_name}</div>
            <div className={styles.drawerMeta}>
              {currentStage && (
                <span className={styles.drawerStageBadge} style={{ background: `${currentStage.color}18`, color: currentStage.color, borderColor: `${currentStage.color}40` }}>
                  {currentStage.name}
                </span>
              )}
              <span className={styles.drawerValue}>{fmt(editLead.estimated_value)}</span>
              <TempBadge temp={editLead.temperature} />
            </div>
          </div>
          <button className={styles.drawerCloseBtn} onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Toast */}
        {toast && <div className={styles.drawerToast}>{toast}</div>}

        {/* Tabs */}
        <div className={styles.drawerTabs}>
          <button className={`${styles.drawerTab} ${tab === 'dados' ? styles.drawerTabActive : ''}`} onClick={() => setTab('dados')}>
            📋 Dados
          </button>
          <button className={`${styles.drawerTab} ${tab === 'timeline' ? styles.drawerTabActive : ''}`} onClick={() => setTab('timeline')}>
            📊 Timeline
          </button>
          <button className={`${styles.drawerTab} ${tab === 'tarefas' ? styles.drawerTabActive : ''}`} onClick={() => setTab('tarefas')}>
            ✅ Tarefas
            {taskCount.overdue > 0 && <span className={styles.drawerBadgeRed}>{taskCount.overdue}</span>}
            {taskCount.overdue === 0 && taskCount.pending > 0 && <span className={styles.drawerBadgeBlue}>{taskCount.pending}</span>}
          </button>
          <button className={`${styles.drawerTab} ${tab === 'ia' ? styles.drawerTabActive : ''}`} onClick={() => setTab('ia')} title="Advisor de IA — sugestão de follow-up">
            🤖 IA
          </button>
        </div>

        {/* Tab Content */}
        <div className={styles.drawerBody}>
          {/* ─── Tab: Dados ────────────────────────────────────────────── */}
          {tab === 'dados' && (
            <div className={styles.drawerForm}>
              <div className={styles.field}>
                <label>Empresa *</label>
                <input value={editLead.company_name} onChange={e => setEditLead(l => ({ ...l, company_name: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>Etapa</label>
                <select value={editLead.stage_id} onChange={e => setEditLead(l => ({ ...l, stage_id: e.target.value }))}>
                  {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 12px' }}>
                {pipelineFields.filter(f => getBaseType(f.type) !== 'system_stage_id').map(field => {
                  const bType = getBaseType(field.type)
                  const isHalf = getFieldWidth(field.type) === 'half' && bType !== 'longtext' && bType !== 'system_notes' && bType !== 'cnpj'
                  const isSys = bType.startsWith('system_')
                  const sysKey = isSys ? bType.replace('system_', '') : ''
                  const val = isSys ? (editLead as any)[sysKey] : (customFields[field.name] || '')

                  const setVal = (v: any) => {
                    const finalVal = (sysKey === 'estimated_value') ? (parseFloat(v) || 0) : v
                    if (isSys) {
                      setEditLead(l => ({ ...l, [sysKey]: finalVal }))
                    } else {
                      setCustomFields(f => ({ ...f, [field.name]: v }))
                    }
                  }

                  // ── Campo CNPJ — só input formatado (lead já cadastrado, sem lookup)
                  if (bType === 'cnpj') {
                    const cnpjVal = (customFields[field.name] || '') as string
                    return (
                      <div key={field.id} className={styles.field} style={{ flex: '0 0 calc(50% - 6px)' }}>
                        <label>{field.name}</label>
                        <input
                          type="text"
                          value={cnpjVal}
                          placeholder="00.000.000/0000-00"
                          maxLength={18}
                          onChange={e => {
                            const formatted = formatCnpj(e.target.value)
                            setCustomFields(prev => ({ ...prev, [field.name]: formatted }))
                          }}
                        />
                      </div>
                    )
                  }

                  return (
                    <div key={field.id} className={styles.field} style={{ flex: isHalf ? '0 0 calc(50% - 6px)' : '0 0 100%' }}>
                      <label>{field.name}</label>
                      {bType === 'longtext' || bType === 'system_notes' ? (
                        <textarea value={val || ''} onChange={e => setVal(e.target.value)} />
                      ) : bType === 'select' ? (
                        <select value={val || ''} onChange={e => setVal(e.target.value)}>
                          <option value="">Selecione...</option>
                          {(field.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : bType === 'currency' || bType === 'system_estimated_value' ? (
                        <CurrencyInput
                          value={val}
                          onChange={v => {
                            if (isSys) setEditLead(l => ({ ...l, [sysKey]: v }))
                            else setCustomFields(f => ({ ...f, [field.name]: v }))
                          }}
                        />
                      ) : (
                        <input
                          type={bType === 'number' ? 'number' : bType === 'date' ? 'date' : bType === 'email' ? 'email' : 'text'}
                          value={val || ''}
                          onChange={e => setVal(e.target.value)}
                        />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Notas por etapa */}
              {currentStage && (
                <StageNotesSection
                  lead={editLead}
                  currentStageId={currentStage.id}
                  currentStageName={currentStage.name}
                  onSave={saveStageNotes}
                  onActivityLogged={() => setTimelineKey(k => k + 1)}
                />
              )}

              {/* Actions */}
              <div className={styles.drawerFormActions}>
                <button className={`${styles.btn} ${styles.btnDanger} ${styles.btnSm}`} onClick={deleteLead}>
                  Excluir Lead
                </button>
                <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveLead} disabled={saving || !editLead.company_name.trim()}>
                  {saving ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </div>
          )}

          {/* ─── Tab: Timeline ─────────────────────────────────────────── */}
          {tab === 'timeline' && (
            <div className={styles.drawerTimelineWrap}>
              <ActivityTimeline leadId={lead.id} key={timelineKey} />
              <div className={styles.drawerTimelineFooter}>
                <RegisterActivityForm
                  leadId={lead.id}
                  onCreated={() => setTimelineKey(k => k + 1)}
                />
              </div>
            </div>
          )}

          {/* ─── Tab: Tarefas ──────────────────────────────────────────── */}
          {tab === 'tarefas' && (
            <TaskList leadId={lead.id} />
          )}

          {/* ─── Tab: IA Advisor ───────────────────────────────────────── */}
          {tab === 'ia' && (
            <AIAdvisorTab
              lead={editLead}
              currentStageName={currentStage?.name || 'Etapa atual'}
            />
          )}
        </div>
      </div>
    </>
  )
}
