'use client'
import React, { useEffect, useState, useCallback, useRef } from 'react'
import CustomSelect, { SelectOption } from '@/components/CustomSelect'
import CustomDatePicker from '@/components/CustomDatePicker'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { crmCall, CrmPipeline, CrmStage, CrmLead, CrmPipelineField, CrmTask } from '@/lib/crm-api'
import Sidebar from '@/components/Sidebar'
import NGPLoading from '@/components/NGPLoading'
import { comercialNav } from '../comercial-nav'
import styles from './pipeline.module.css'
import { Suspense } from 'react'
import LeadDetailPanel from './LeadDetailPanel'
import { CnpjLookupCard, CnpjImportField, formatCnpj } from './CnpjLookup'
import {
  DndContext, DragEndEvent, DragOverEvent, DragStartEvent,
  DragOverlay, PointerSensor, useSensor, useSensors,
  rectIntersection, useDroppable,
} from '@dnd-kit/core'
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ─── Sidebar nav ─────────────────────────────────────────────────────────────
// Removida definição local para usar comercial-nav.tsx

import { LeadCard, KanbanColumn } from './components/KanbanComponents'
import { SortableStageRow, SortableFieldRow, SortablePreviewField, CurrencyInput, getBaseType, getFieldWidth } from './components/FieldComponents'

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)



// ─── Page ────────────────────────────────────────────────────────────────────
// ─── Pipeline Content (com suporte a SearchParams/Suspense) ─────────────────
function PipelineContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [sess, setSess] = useState<ReturnType<typeof getSession> | null>(null)

  const tabParam = searchParams.get('tab')
  const actionParam = searchParams.get('action')

  // Data
  const [pipelines, setPipelines]               = useState<CrmPipeline[]>([])
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null)
  const [viewMode, setViewMode]                 = useState<'kanban' | 'funil' | 'fields'>('kanban')
  const [stages, setStages]                     = useState<CrmStage[]>([])
  const [leads, setLeads]                       = useState<CrmLead[]>([])
  const [pipelineFields, setPipelineFields]     = useState<CrmPipelineField[]>([])
  const [pipelineTasks, setPipelineTasks]       = useState<CrmTask[]>([])
  const [loading, setLoading]                   = useState(true)
  const [error, setError]                       = useState('')
  const [toast, setToast]                       = useState('')

  // DnD
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null)
  const activeLead = leads.find(l => l.id === activeLeadId) || null

  // Modals
  const [showNewPipeline,   setShowNewPipeline]   = useState(false)
  const [showNewLead,       setShowNewLead]       = useState(false)
  const [showManageStages,  setShowManageStages]  = useState(false)
  const [showEditLead,      setShowEditLead]      = useState(false)
  const [showDeletePipeline,setShowDeletePipeline]= useState(false)

  // Forms
  const [fPipelineName, setFPipelineName] = useState('')
  const [fPipelineDesc, setFPipelineDesc] = useState('')
  const [fLead, setFLead] = useState({ company_name: '', contact_name: '', email: '', phone: '', estimated_value: '', stage_id: '', notes: '', source: '', custom_data: {} as Record<string, any> })
  const [editLead, setEditLead] = useState<CrmLead | null>(null)
  const [editLeadCustomFields, setEditLeadCustomFields] = useState<Record<string, any>>({})
  const [stageEdits, setStageEdits] = useState<{ id: string; name: string; color: string }[]>([])
  const [fieldEdits, setFieldEdits] = useState<CrmPipelineField[]>([])
  const [newStageName, setNewStageName] = useState('')
  const [newFieldName, setNewFieldName] = useState('')
  const [newFieldType, setNewFieldType] = useState('text')
  const [newFieldOptions, setNewFieldOptions] = useState<string[]>([])
  const [initialTab, setInitialTab] = useState<'dados'|'timeline'|'tarefas'>('dados')
  const [saving, setSaving] = useState(false)
  const [expandedFunnelStages, setExpandedFunnelStages] = useState<Record<string, boolean>>({})

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const s = getSession()
    if (!s || s.auth !== '1') { router.replace('/login'); return }
    if (s.role !== 'ngp' && s.role !== 'admin') { router.replace('/cliente'); return }
    setSess(s)
  }, [router])

  // ── Load pipelines ────────────────────────────────────────────────────────
  const loadPipelines = useCallback(async () => {
    const data = await crmCall('crm-manage-pipeline', { action: 'list' })
    if (data.error) { setError(data.error); return [] }
    setPipelines(data.pipelines || [])
    return data.pipelines || []
  }, [])

  // ── Warmup periódico da Edge Function (evita cold start) ─────────────────
  useEffect(() => {
    // Aquece imediatamente ao montar e repete a cada 50s (antes do timeout de 60s do Deno)
    const warm = () => fetch('/api/crm-warmup').catch(() => {})
    warm()
    const interval = setInterval(warm, 50_000)
    return () => clearInterval(interval)
  }, [])

  // ── Load ALL pipeline data in a single consolidated call ──────────────────
  const loadInitialData = useCallback(async (pipelineId?: string) => {
    setLoading(true)
    setError('')
    try {
      const data = await crmCall('crm-manage-pipeline', {
        action: 'get_full_data',
        pipeline_id: pipelineId || null
      })
      
      if (data.error) {
        // Fallback for case where Edge Function hasn't been deployed yet with the new action
        if (data.error.includes('desconhecida')) {
          const pls = await crmCall('crm-manage-pipeline', { action: 'list' })
          if (pls.pipelines) {
            setPipelines(pls.pipelines)
            const firstId = pipelineId || (pls.pipelines.length > 0 ? pls.pipelines[0].id : null)
            if (firstId) {
              const [sData, lData, fData, tData] = await Promise.all([
                crmCall('crm-manage-stages', { action: 'list', pipeline_id: firstId }),
                crmCall('crm-manage-leads',  { action: 'list', pipeline_id: firstId }),
                crmCall('crm-manage-fields', { action: 'list', pipeline_id: firstId }),
                crmCall('crm-manage-tasks',  { action: 'list_team', status: 'pendente' })
              ])
              setStages(sData.stages || [])
              setLeads(lData.leads || [])
              setPipelineFields(fData.fields || [])
              setPipelineTasks(tData.tasks || [])
            }
          }
          return
        }
        setError(data.error)
        return
      }

      setPipelines(data.pipelines || [])
      setStages(data.stages || [])
      setLeads(data.leads || [])
      setPipelineFields(data.fields || [])
      setPipelineTasks(data.tasks || [])
      
      if (data.active_pipeline_id) {
        setActivePipelineId(data.active_pipeline_id)
      }
    } catch (e: any) {
      setError('Erro de conexão ao carregar dados.')
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Initial load & Change Funnel ──────────────────────────────────────────
  useEffect(() => {
    if (sess) {
      loadInitialData(tabParam === 'kanban' ? undefined : activePipelineId || undefined)
    }
  }, [sess, loadInitialData])

  const switchPipeline = (id: string) => {
    setActivePipelineId(id)
    loadInitialData(id)
  }

  // Keep fieldEdits in sync when pipelineFields reload (e.g. after saving)
  useEffect(() => {
    if (viewMode === 'fields') setFieldEdits([...pipelineFields])
  }, [pipelineFields, viewMode])

  // ── Helpers ───────────────────────────────────────────────────────────────
  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500) }
  function showErr(msg: string)   { setError(msg);  setTimeout(() => setError(''), 5000) }

  function openManageStages() {
    setStageEdits(stages.map(s => ({ id: s.id, name: s.name, color: s.color })))
    setNewStageName('')
    setShowManageStages(true)
  }

  function openManageFields() {
    setFieldEdits([...pipelineFields])
    setNewFieldName('')
    setNewFieldType('text')
    setNewFieldOptions([])
    setViewMode('fields')
  }

  function toggleFunnelStage(stageId: string) {
    setExpandedFunnelStages(prev => ({ ...prev, [stageId]: !prev[stageId] }))
  }

  const openEditLead = useCallback((lead: CrmLead, targetTab?: 'dados'|'timeline'|'tarefas') => {
    setEditLead(lead)
    setEditLeadCustomFields(lead.custom_data || {})
    setInitialTab(targetTab || 'dados')
    setShowEditLead(true)
  }, [])

  // ── Sync URL Params ───────────────────────────────────────────────────────
  useEffect(() => {
    if (tabParam === 'fields') setViewMode('fields')
    if (tabParam === 'kanban') setViewMode('kanban')
    if (actionParam === 'new_pipeline') setShowNewPipeline(true)
  }, [tabParam, actionParam])

  // ── Actions: Pipeline ─────────────────────────────────────────────────────
  async function createPipeline() {
    if (!fPipelineName.trim()) return
    setSaving(true)
    const data = await crmCall('crm-manage-pipeline', { action: 'create', name: fPipelineName, description: fPipelineDesc })
    setSaving(false)
    if (data.error) { showErr(data.error); return }
    setPipelines(prev => [...prev, data.pipeline])
    switchPipeline(data.pipeline.id)
    setFPipelineName(''); setFPipelineDesc('')
    setShowNewPipeline(false)
    showToast(`Funil "${data.pipeline.name}" criado!`)
  }

  async function deletePipeline() {
    if (!activePipelineId) return
    setSaving(true)
    const data = await crmCall('crm-manage-pipeline', { action: 'delete', pipeline_id: activePipelineId })
    setSaving(false)
    if (data.error) { showErr(data.error); setShowDeletePipeline(false); return }
    const remaining = pipelines.filter(p => p.id !== activePipelineId)
    setPipelines(remaining)
    setShowDeletePipeline(false)
    if (remaining.length > 0) {
      switchPipeline(remaining[0].id)
    } else {
      setActivePipelineId(null); setStages([]); setLeads([])
    }
    showToast('Funil excluído.')
  }

  // ── Actions: Lead ─────────────────────────────────────────────────────────
  async function createLead() {
    if (saving || !fLead.company_name.trim() || !fLead.stage_id || !activePipelineId) return
    setSaving(true)

    // Update Otimista
    const tempId = 'temp-' + Date.now()
    const optimisticLead: CrmLead = {
      id: tempId,
      pipeline_id: activePipelineId,
      stage_id: fLead.stage_id,
      company_name: fLead.company_name,
      contact_name: fLead.contact_name,
      email: fLead.email,
      phone: fLead.phone,
      estimated_value: parseFloat(fLead.estimated_value) || 0,
      position: 0, // Novo lead sempre no topo
      notes: fLead.notes,
      source: fLead.source,
      status: 'active',
      custom_data: fLead.custom_data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    
    // Guarda cópia do form para restaurar em caso de erro
    const formBackup = { ...fLead, custom_data: { ...fLead.custom_data } }

    setLeads(prev => [
      ...prev.map(l => l.stage_id === fLead.stage_id ? { ...l, position: l.position + 1 } : l),
      optimisticLead
    ])
    setShowNewLead(false)
    setFLead({ company_name: '', contact_name: '', email: '', phone: '', estimated_value: '', stage_id: stages[0]?.id || '', notes: '', source: '', custom_data: {} })

    try {
      const data = await crmCall('crm-manage-leads', {
        action: 'create', pipeline_id: activePipelineId,
        stage_id: optimisticLead.stage_id, company_name: optimisticLead.company_name,
        contact_name: optimisticLead.contact_name, email: optimisticLead.email, phone: optimisticLead.phone,
        estimated_value: optimisticLead.estimated_value,
        notes: optimisticLead.notes, source: optimisticLead.source, custom_data: optimisticLead.custom_data
      })

      if (data.error) {
        showErr(data.error)
        setLeads(prev => prev.filter(l => l.id !== tempId))
        setFLead(formBackup)
        setShowNewLead(true)
        return
      }

      // Substitui o lead otimista pelo real vindo do banco
      setLeads(prev => prev.map(l => l.id === tempId ? data.lead : l))
      showToast('Lead criado!')
    } catch {
      showErr('Erro de conexão ao criar lead.')
      setLeads(prev => prev.filter(l => l.id !== tempId))
      setFLead(formBackup)
      setShowNewLead(true)
    } finally {
      setSaving(false)
    }
  }

  async function updateLead() {
    if (!editLead) return
    setSaving(true)
    const data = await crmCall('crm-manage-leads', {
      action: 'update', lead_id: editLead.id,
      company_name: editLead.company_name, contact_name: editLead.contact_name,
      email: editLead.email, phone: editLead.phone,
      estimated_value: editLead.estimated_value,
      notes: editLead.notes, source: editLead.source, custom_data: editLeadCustomFields
    })
    setSaving(false)
    if (data.error) { showErr(data.error); return }
    setLeads(prev => prev.map(l => l.id === data.lead.id ? data.lead : l))
    setShowEditLead(false)
    showToast('Lead atualizado!')
  }

  async function deleteLead() {
    if (!editLead || !confirm(`Excluir "${editLead.company_name}"?`)) return
    
    // Update Otimista
    const leadToDelete = editLead
    setLeads(prev => prev.filter(l => l.id !== leadToDelete.id))
    setShowEditLead(false)

    const data = await crmCall('crm-manage-leads', { action: 'delete', lead_id: leadToDelete.id })
    if (data.error) {
      showErr(data.error)
      setLeads(prev => [...prev, leadToDelete]) // Rollback
      return
    }
    showToast('Lead excluído.')
  }

  // ── Actions: Stages ───────────────────────────────────────────────────────
  async function saveStages() {
    if (!activePipelineId) return
    setSaving(true)
    try {
      // Adicionar nova etapa se preenchida
      if (newStageName.trim()) {
        const data = await crmCall('crm-manage-stages', { action: 'create', pipeline_id: activePipelineId, name: newStageName })
        if (data.error) { showErr(data.error); return }
      }
      // Aplicar renomes e cores
      for (const se of stageEdits) {
        const orig = stages.find(s => s.id === se.id)
        if (orig && (orig.name !== se.name || orig.color !== se.color)) {
          if (orig.name !== se.name)   await crmCall('crm-manage-stages', { action: 'rename',       stage_id: se.id, name: se.name })
          if (orig.color !== se.color) await crmCall('crm-manage-stages', { action: 'update_color', stage_id: se.id, color: se.color })
        }
      }
      // Reordenar
      await crmCall('crm-manage-stages', { action: 'reorder', pipeline_id: activePipelineId, ordered_ids: stageEdits.map(s => s.id) })
    } finally {
      setSaving(false)
    }
    await loadInitialData(activePipelineId)
    setShowManageStages(false)
    showToast('Etapas atualizadas!')
  }

  async function deleteStage(stageId: string) {
    const leadsInStage = leads.filter(l => l.stage_id === stageId).length
    if (leadsInStage > 0) { showErr(`Esta etapa tem ${leadsInStage} lead(s). Mova-os antes de excluir.`); return }
    if (!confirm('Excluir esta etapa?')) return
    const data = await crmCall('crm-manage-stages', { action: 'delete', stage_id: stageId })
    if (data.error) { showErr(data.error); return }
    setStageEdits(prev => prev.filter(s => s.id !== stageId))
    if (activePipelineId) loadInitialData(activePipelineId)
    showToast('Etapa excluída.')
  }

  function moveStage(index: number, direction: 'up' | 'down') {
    const newEdits = [...stageEdits]
    if (direction === 'up' && index > 0) {
      const temp = newEdits[index - 1]
      newEdits[index - 1] = newEdits[index]
      newEdits[index] = temp
      setStageEdits(newEdits)
    } else if (direction === 'down' && index < newEdits.length - 1) {
      const temp = newEdits[index + 1]
      newEdits[index + 1] = newEdits[index]
      newEdits[index] = temp
      setStageEdits(newEdits)
    }
  }

  function handleFieldDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setFieldEdits(items => {
        const oldIndex = items.findIndex(i => i.id === active.id)
        const newIndex = items.findIndex(i => i.id === over.id)
        const newItems = [...items]
        const [moved] = newItems.splice(oldIndex, 1)
        newItems.splice(newIndex, 0, moved)
        return newItems
      })
    }
  }

  function handleStageDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setStageEdits(items => {
        const oldIndex = items.findIndex(i => i.id === active.id)
        const newIndex = items.findIndex(i => i.id === over.id)
        const newItems = [...items]
        const [moved] = newItems.splice(oldIndex, 1)
        newItems.splice(newIndex, 0, moved)
        return newItems
      })
    }
  }

  // ── Actions: Fields ───────────────────────────────────────────────────────
  async function saveFields() {
    if (!activePipelineId) return
    setSaving(true)
    try {
      if (newFieldName.trim()) {
        const type = newFieldType
        const options = newFieldOptions.filter(o => o.trim())
        const data = await crmCall('crm-manage-fields', { action: 'create', pipeline_id: activePipelineId, name: newFieldName, type, options })
        if (data.error) { showErr(data.error); return }
        setNewFieldName('')
        setNewFieldOptions([])
      }
      for (const fe of fieldEdits) {
        const orig = pipelineFields.find(f => f.id === fe.id)
        if (orig && (orig.name !== fe.name || orig.type !== fe.type || JSON.stringify(orig.options) !== JSON.stringify(fe.options))) {
          await crmCall('crm-manage-fields', { action: 'update', field_id: fe.id, name: fe.name, type: fe.type, options: fe.options })
        }
      }
      await crmCall('crm-manage-fields', { action: 'reorder', pipeline_id: activePipelineId, ordered_ids: fieldEdits.map(f => f.id) })
    } finally {
      setSaving(false)
    }
    await loadInitialData(activePipelineId)
    showToast('Arquitetura salva com sucesso!')
  }

  async function deleteField(fieldId: string) {
    if (!confirm('Excluir este campo? Ele sumirá de todos os leads!')) return
    const data = await crmCall('crm-manage-fields', { action: 'delete', field_id: fieldId })
    if (data.error) { showErr(data.error); return }
    setFieldEdits(prev => prev.filter(f => f.id !== fieldId))
    if (activePipelineId) loadInitialData(activePipelineId)
    showToast('Campo excluído.')
  }

  // ── Drag and Drop ─────────────────────────────────────────────────────────
  function handleDragStart(event: DragStartEvent) {
    // Fecha modal de edição para evitar conflito de estado durante drag
    if (showEditLead) { setShowEditLead(false); setEditLead(null) }
    setActiveLeadId(event.active.id as string)
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return
    const activeId = active.id as string
    const overId   = over.id as string

    const activeLead = leads.find(l => l.id === activeId)
    if (!activeLead) return

    // over é uma stage (coluna)
    const overStage = stages.find(s => s.id === overId)
    if (overStage && activeLead.stage_id !== overStage.id) {
      setLeads(prev => prev.map(l => l.id === activeId ? { ...l, stage_id: overStage.id } : l))
      return
    }

    // over é um lead em outra coluna
    const overLead = leads.find(l => l.id === overId)
    if (overLead && overLead.stage_id !== activeLead.stage_id) {
      setLeads(prev => prev.map(l => l.id === activeId ? { ...l, stage_id: overLead.stage_id } : l))
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveLeadId(null)
    if (!over) return

    const leadId  = active.id as string
    const lead    = leads.find(l => l.id === leadId)
    if (!lead) return

    // Determina stage de destino
    let targetStageId = lead.stage_id
    const overStage   = stages.find(s => s.id === over.id)
    const overLead    = leads.find(l => l.id === over.id)
    if (overStage) targetStageId = overStage.id
    else if (overLead) targetStageId = overLead.stage_id

    const leadsInTarget = leads.filter(l => l.stage_id === targetStageId && l.id !== leadId)
    let newPosition = leadsInTarget.length

    if (overLead && overLead.stage_id === targetStageId) {
      newPosition = overLead.position
    }

    // Chama a Edge Function para persistir (já atualizou otimisticamente no handleDragOver)
    const data = await crmCall('crm-manage-leads', {
      action: 'move', lead_id: leadId,
      new_stage_id: targetStageId, new_position: newPosition,
    })
    if (data.error) {
      showErr(data.error)
      // Reverte recarregando do servidor
      if (activePipelineId) loadInitialData(activePipelineId)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (!sess) return <NGPLoading loading={true} loadingText="Carregando pipeline..." />

  const activePipeline = pipelines.find(p => p.id === activePipelineId)

  return (
    <div className={styles.layout}>
      <Sidebar 
        minimal 
        sectorNav={comercialNav} 
        sectorNavTitle="COMERCIAL" 
        activeTab={viewMode}
        onTabChange={(tab) => {
          if (tab === 'new_pipeline') setShowNewPipeline(true)
          else if (tab === 'fields') openManageFields()
          else if (tab === 'funil') setViewMode('funil')
          else if (tab === 'kanban') setViewMode('kanban')
          else setViewMode(tab as any)
        }}
      />
      {/* Loading removido */}

      <main className={styles.main}>
        <div className={styles.content}>

          {/* Header */}
          <header className={styles.header}>
            <div className={styles.headerLeft}>
              <div>
                <span className={styles.eyebrow}>SETOR COMERCIAL</span>
                <h1 className={styles.title}>
                  {viewMode === 'kanban' ? 'Meus Pipers' : viewMode === 'funil' ? 'Funil' : viewMode === 'fields' ? 'Cadastrar Campos' : 'Pipeline'}
                </h1>
              </div>
              {(viewMode === 'kanban' || viewMode === 'funil') && activePipeline && pipelines.length > 0 && (
                <CustomSelect
                  caption="Funil"
                  value={activePipelineId || ''}
                  options={pipelines.map(p => ({ id: p.id, label: p.name }))}
                  onChange={val => {
                    setActivePipelineId(val)
                    loadInitialData(val)
                  }}
                  placeholder="Selecionar funil..."
                />
              )}
            </div>

            <div className={styles.headerRight}>
              {activePipeline && viewMode === 'kanban' && (
                <>
                  <button className={`${styles.btn} ${styles.btnGhost}`} onClick={openManageStages}>⚙ Etapas</button>
                  <button className={`${styles.btn} ${styles.btnGhost} ${styles.btnIcon}`} title="Excluir funil" onClick={() => setShowDeletePipeline(true)}>🗑</button>
                </>
              )}
              {activePipeline && (viewMode === 'kanban' || viewMode === 'funil') && (
                <button
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  onClick={() => { setFLead({ company_name: '', contact_name: '', email: '', phone: '', estimated_value: '', stage_id: stages[0]?.id || '', notes: '', source: '', custom_data: {} }); setShowNewLead(true) }}
                >
                  + Novo Lead
                </button>
              )}

            </div>
          </header>

          {error && <div className={styles.errorBar}>{error}</div>}
          {toast && <div className={styles.successBar}>{toast}</div>}

          {/* Board */}
          {loading && pipelines.length === 0 ? (
            <div className={styles.loadingWrap}></div>
          ) : pipelines.length === 0 ? (
            <div className={styles.loadingWrap}>
              <div style={{ textAlign: 'center' }}>
                <div className={styles.loadingText} style={{ marginBottom: 16 }}>Nenhum funil criado ainda.</div>
                <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setShowNewPipeline(true)}>+ Criar primeiro funil</button>
              </div>
            </div>
          ) : viewMode === 'funil' ? (
            <div className={styles.funnelWrap}>
              {/* Totalizador */}
              <div className={styles.funnelHeader}>
                <div className={styles.funnelHeaderStat}>
                  <span className={styles.funnelHeaderLabel}>Total de leads</span>
                  <span className={styles.funnelHeaderValue}>{leads.length}</span>
                </div>
                <div className={styles.funnelHeaderDivider} />
                <div className={styles.funnelHeaderStat}>
                  <span className={styles.funnelHeaderLabel}>Valor total</span>
                  <span className={styles.funnelHeaderValue}>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(leads.reduce((s, l) => s + (l.estimated_value || 0), 0))}</span>
                </div>
                <div className={styles.funnelHeaderDivider} />
                <div className={styles.funnelHeaderStat}>
                  <span className={styles.funnelHeaderLabel}>Etapas</span>
                  <span className={styles.funnelHeaderValue}>{stages.length}</span>
                </div>
              </div>

              {/* Barras do funil */}
              <div className={styles.funnelBody}>
                {stages.map((stage, idx) => {
                  const stageLeads  = leads.filter(l => l.stage_id === stage.id)
                  const maxLeads    = Math.max(...stages.map(s => leads.filter(l => l.stage_id === s.id).length), 1)
                  const pct         = Math.max(18, Math.round((stageLeads.length / maxLeads) * 100))
                  const valor       = stageLeads.reduce((s, l) => s + (l.estimated_value || 0), 0)
                  const nextLeads   = leads.filter(l => l.stage_id === stages[idx + 1]?.id)
                  const isExpanded  = !!expandedFunnelStages[stage.id]
                  const convPct     = idx < stages.length - 1 && stageLeads.length > 0
                    ? Math.round((nextLeads.length / stageLeads.length) * 100)
                    : null

                  return (
                    <div key={stage.id} className={styles.funnelStageBlock}>
                      <div className={styles.funnelRow}>
                        {/* Barra */}
                        <div className={styles.funnelBarSection}>
                          <button
                            type="button"
                            className={`${styles.funnelExpandBtn} ${isExpanded ? styles.funnelExpandBtnOpen : ''}`}
                            onClick={() => toggleFunnelStage(stage.id)}
                            aria-expanded={isExpanded}
                            aria-label={`${isExpanded ? 'Ocultar' : 'Mostrar'} leads da etapa ${stage.name}`}
                          >
                            <span className={styles.funnelExpandIcon}>⌄</span>
                          </button>
                          <div className={styles.funnelBarWrap}>
                            <div
                              className={styles.funnelBarFill}
                              style={{ width: `${pct}%`, background: stage.color, opacity: stageLeads.length === 0 ? 0.15 : 0.85 }}
                            >
                              {stageLeads.length > 0 && (
                                <span className={styles.funnelBarLabel}>{stageLeads.length}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Info à direita */}
                        <div className={styles.funnelRowInfo}>
                          <div className={styles.funnelRowLeft}>
                            <span className={styles.funnelColorDot} style={{ background: stage.color }} />
                            <div>
                              <div className={styles.funnelStageName}>{stage.name}</div>
                              <div className={styles.funnelStageCount}>{stageLeads.length} lead{stageLeads.length !== 1 ? 's' : ''}</div>
                            </div>
                          </div>
                          <div className={styles.funnelRowRight}>
                            <span className={styles.funnelStageValue}>
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)}
                            </span>
                            {convPct !== null && (
                              <span className={`${styles.funnelConvBadge} ${convPct >= 50 ? styles.funnelConvGood : convPct >= 20 ? styles.funnelConvMid : styles.funnelConvLow}`}>
                                ↓ {convPct}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className={styles.funnelLeadList}>
                          {stageLeads.length === 0 ? (
                            <div className={styles.funnelLeadEmpty}>Nenhum lead nesta etapa.</div>
                          ) : (
                            stageLeads
                              .slice()
                              .sort((a, b) => (b.estimated_value || 0) - (a.estimated_value || 0))
                              .map(lead => (
                                <button
                                  key={lead.id}
                                  type="button"
                                  className={styles.funnelLeadItem}
                                  onClick={() => openEditLead(lead)}
                                >
                                  <div className={styles.funnelLeadMain}>
                                    <span className={styles.funnelLeadCompany}>{lead.company_name}</span>
                                    <span className={styles.funnelLeadMeta}>
                                      {lead.contact_name || 'Sem contato'}
                                      {lead.source ? ` • ${lead.source}` : ''}
                                    </span>
                                  </div>
                                  <span className={styles.funnelLeadValue}>{fmt(lead.estimated_value || 0)}</span>
                                </button>
                              ))
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : viewMode === 'fields' ? (
            <div style={{ flex: 1, padding: '24px 32px', width: '100%', display: 'flex', gap: 32, overflow: 'hidden' }}>
              {/* Coluna 1: Editor Técnico */}
              <div style={{ flex: '0 0 420px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <h2 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>Cadastrar Campos</h2>
                    <p style={{ fontSize: 13, color: '#64748b' }}>Configure arquitetura de dados e ordem.</p>
                  </div>
                  <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setViewMode('kanban')}>← Sair</button>
                </div>

                <div className={styles.stagesList} style={{ maxHeight: 'calc(100vh - 280px)', background: '#ffffff', border: '1px solid #e2e8f0', padding: 16, borderRadius: 12, overflowY: 'auto' }}>
                  <DndContext sensors={sensors} collisionDetection={rectIntersection} onDragEnd={handleFieldDragEnd}>
                        <SortableContext items={fieldEdits.map(s => s.id)} strategy={verticalListSortingStrategy}>
                          {fieldEdits.map((fe, idx) => (
                            <SortableFieldRow
                              key={fe.id}
                              field={fe}
                              saving={saving}
                              index={idx}
                              total={fieldEdits.length}
                              onDelete={() => deleteField(fe.id)}
                              onChangeName={(val) => setFieldEdits(prev => prev.map(f => f.id === fe.id ? { ...f, name: val } : f))}
                              onChangeType={(val) => setFieldEdits(prev => prev.map(f => f.id === fe.id ? { ...f, type: val } : f))}
                              onChangeOptions={(val) => setFieldEdits(prev => prev.map(f => f.id === fe.id ? { ...f, options: val } : f))}
                              styles={styles}
                            />
                          ))}
                        </SortableContext>
                  </DndContext>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16, padding: '16px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input className={styles.addStageInput} style={{ flex: 1, background: '#fff' }} placeholder="+ Nome do novo campo" value={newFieldName} onChange={e => setNewFieldName(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveFields()} />
                      <CustomSelect
                        caption="Tipo"
                        value={newFieldType}
                        options={[
                          { id: 'system_stage_id', label: 'Etapa' },
                          { id: 'system_contact_name', label: 'Contato' },
                          { id: 'system_source', label: 'Origem' },
                          { id: 'system_phone', label: 'Telefone' },
                          { id: 'system_email', label: 'E-mail' },
                          { id: 'system_estimated_value', label: 'Valor' },
                          { id: 'system_notes', label: 'Obs' },
                          { id: 'text', label: 'Texto Curto' },
                          { id: 'longtext', label: 'Texto Longo' },
                          { id: 'number', label: 'Número' },
                          { id: 'currency', label: 'Moeda' },
                          { id: 'phone', label: 'Telefone' },
                          { id: 'email', label: 'Email' },
                          { id: 'cnpj', label: 'CNPJ/CPF' },
                          { id: 'date', label: 'Data' },
                          { id: 'select', label: 'Múltipla Escolha' },
                        ]}
                        onChange={val => setNewFieldType(val)}
                      />
                    </div>
                    {newFieldType === 'select' && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                        {(newFieldOptions || []).map((opt, idx) => (
                           <div key={idx} style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 4px' }}>
                             <input 
                               style={{ border: 'none', background: 'transparent', fontSize: 12, padding: 2, width: 80 }}
                               value={opt}
                               onChange={e => {
                                 const next = [...newFieldOptions]
                                 next[idx] = e.target.value
                                 setNewFieldOptions(next)
                               }}
                             />
                             <button onClick={() => setNewFieldOptions(prev => prev.filter((_, i) => i !== idx))} style={{ border: 'none', background: 'transparent', color: '#94a3b8', fontSize: 14 }}>×</button>
                           </div>
                        ))}
                        <button className={styles.btnSm} style={{ background: '#fff', border: '1px dashed #cbd5e1', color: '#3b82f6' }} onClick={() => setNewFieldOptions(prev => [...prev, 'Opção'])}>+ Opção</button>
                      </div>
                    )}
                  </div>
                </div>
                <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveFields} disabled={saving} style={{ padding: '12px 24px', width: '100%' }}>
                  {saving ? 'Salvando...' : 'Salvar Arquitetura'}
                </button>
              </div>

              {/* Coluna 2: Live Preview (Simulador do Modal) */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <p style={{ fontSize: 13, color: '#64748b' }}>Simulação do formulário de abertura de lead.</p>
                </div>
                
                <div style={{ flex: 1, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 16, padding: 32, overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
                  <div className={styles.modal} style={{ position: 'relative', width: '100%', maxWidth: 500, height: 'fit-content', boxShadow: '0 20px 50px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', cursor: 'default' }} onClick={e => e.stopPropagation()}>
                    <h2 className={styles.modalTitle}>Novo Lead (Simulação)</h2>
                    <div className={styles.field} style={{ opacity: 0.5 }}>
                      <label>Empresa *</label>
                      <input placeholder="Nome da empresa" disabled />
                    </div>
                    {/* Aqui renderizamos os itens sortáveis no preview também */}
                    <DndContext sensors={sensors} collisionDetection={rectIntersection} onDragEnd={handleFieldDragEnd}>
                      <SortableContext items={fieldEdits.map(s => s.id)} strategy={verticalListSortingStrategy}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px 12px' }}>
                          {fieldEdits.map(fe => (
                            <SortablePreviewField key={fe.id} field={fe} styles={styles} />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                    <div className={styles.modalActions} style={{ opacity: 0.5, borderTop: '1px solid #f1f5f9', paddingTop: 16, marginTop: 12 }}>
                      <button className={`${styles.btn} ${styles.btnGhost}`} disabled>Cancelar</button>
                      <button className={`${styles.btn} ${styles.btnPrimary}`} disabled>Criar Lead</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={rectIntersection}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              <div className={styles.board}>
                {stages.map(stage => (
                  <KanbanColumn
                    key={stage.id}
                    stage={stage}
                    allTasks={pipelineTasks}
                    leads={leads.filter(l => l.stage_id === stage.id).sort((a, b) => a.position - b.position)}
                    onEdit={openEditLead}
                    onAddLead={(stageId) => {
                      setFLead({ company_name: '', contact_name: '', email: '', phone: '', estimated_value: '', stage_id: stageId, notes: '', source: '', custom_data: {} })
                      setShowNewLead(true)
                    }}
                    styles={styles}
                  />
                ))}
              </div>

              <DragOverlay>
                {activeLead && <LeadCard lead={activeLead} onEdit={() => {}} overlay styles={styles} />}
              </DragOverlay>
            </DndContext>
          )}

          <div className={styles.footer}>
            <span className={styles.footerDot} />
            Conectado ao Supabase · {sess?.user}
          </div>

        </div>
      </main>

      {/* ── Modal: Novo Funil ────────────────────────────────────────────── */}
      {showNewPipeline && (
        <div className={styles.overlay} onClick={() => setShowNewPipeline(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Novo Funil</h2>
            <div className={styles.field}>
              <label>Nome do funil *</label>
              <input placeholder="Ex: Vendas B2B" value={fPipelineName} onChange={e => setFPipelineName(e.target.value)} autoFocus />
            </div>
            <div className={styles.field}>
              <label>Descrição</label>
              <input placeholder="Descrição opcional" value={fPipelineDesc} onChange={e => setFPipelineDesc(e.target.value)} />
            </div>
            <p style={{ fontSize: 12, color: '#4a5168', margin: 0 }}>Será criado com 5 etapas padrão que você pode personalizar depois.</p>
            <div className={styles.modalActions}>
              <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setShowNewPipeline(false)}>Cancelar</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={createPipeline} disabled={saving || !fPipelineName.trim()}>
                {saving ? 'Criando...' : 'Criar Funil'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Novo Lead ─────────────────────────────────────────────── */}
      {showNewLead && (
        <div className={styles.overlay} onClick={() => setShowNewLead(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Novo Lead</h2>
            <div className={styles.field}>
              <label>Empresa *</label>
              <input placeholder="Nome da empresa" value={fLead.company_name} onChange={e => setFLead(f => ({ ...f, company_name: e.target.value }))} autoFocus />
            </div>
            <div className={styles.field}>
              <label>Etapa *</label>
              <CustomSelect
                label="Etapa"
                caption="Etapa do Funil"
                value={fLead.stage_id}
                options={stages.map(s => ({ id: s.id, label: s.name }))}
                onChange={val => setFLead(f => ({ ...f, stage_id: val }))}
              />
            </div>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px 12px' }}>
              {/* Campos Dinâmicos (exceto Etapa que já está no topo) */}
              {pipelineFields.filter(f => getBaseType(f.type) !== 'system_stage_id').map((field, idx) => {
                const bType = getBaseType(field.type)
                const isHalf = getFieldWidth(field.type) === 'half' && bType !== 'longtext' && bType !== 'system_notes'
                const isSys = bType.startsWith('system_')
                const sysKey = isSys ? bType.replace('system_', '') : ''
                const val = isSys ? (fLead as any)[sysKey] : (fLead.custom_data[field.name] || '')

                const setVal = (v: any) => {
                  if (isSys) {
                    setFLead(f => ({ ...f, [sysKey]: v }))
                  } else {
                    setFLead(f => ({ ...f, custom_data: { ...f.custom_data, [field.name]: v } }))
                  }
                }

                // ── Campo CNPJ: input formatado + card de consulta ──
                if (bType === 'cnpj') {
                  const cnpjVal = (fLead.custom_data[field.name] || '') as string
                  const handleCnpjFill = (selected: CnpjImportField[]) => {
                    const updates: Record<string, string> = {}
                    for (const f of selected) {
                      if (f.fieldName === '_company_name') setFLead(fl => ({ ...fl, company_name: f.value }))
                      else if (f.fieldName) updates[f.fieldName] = f.value
                    }
                    if (Object.keys(updates).length) {
                      setFLead(fl => ({ ...fl, custom_data: { ...fl.custom_data, ...updates } }))
                    }
                  }
                  return (
                    <React.Fragment key={field.id}>
                      <div className={styles.field} style={{ flex: '0 0 calc(50% - 6px)' }}>
                        <label>{field.name}</label>
                        <input
                          type="text"
                          value={cnpjVal}
                          placeholder="00.000.000/0000-00"
                          maxLength={18}
                          onChange={e => setFLead(fl => ({ ...fl, custom_data: { ...fl.custom_data, [field.name]: formatCnpj(e.target.value) } }))}
                        />
                      </div>
                      <div style={{ flex: '0 0 100%' }}>
                        <CnpjLookupCard
                          cnpj={cnpjVal}
                          pipelineFields={pipelineFields}
                          customFields={fLead.custom_data}
                          onFill={handleCnpjFill}
                        />
                      </div>
                    </React.Fragment>
                  )
                }

                return (
                  <div 
                    key={field.id} 
                    className={styles.field} 
                    style={{ 
                      flex: isHalf ? '0 0 calc(50% - 6px)' : '0 0 100%',
                      zIndex: pipelineFields.length - idx,
                      position: 'relative'
                    }}
                  >
                    <label>{field.name}</label>
                    {bType === 'longtext' || bType === 'system_notes' ? (
                      <textarea value={val || ''} onChange={e => setVal(e.target.value)} />
                    ) : bType === 'select' ? (
                      <CustomSelect
                        caption={field.name}
                        value={val || ''}
                        options={(field.options || []).map(o => ({ id: o, label: o }))}
                        onChange={v => setVal(v)}
                        placeholder="Selecione..."
                      />
                    ) : bType === 'currency' || bType === 'system_estimated_value' ? (
                      <CurrencyInput value={val} onChange={setVal} />
                    ) : bType === 'date' ? (
                      <CustomDatePicker
                        caption={field.name}
                        value={val || ''}
                        onChange={v => setVal(v)}
                      />
                    ) : (
                      <input
                        type={bType === 'number' ? 'number' : bType === 'email' ? 'email' : 'text'}
                        value={val || ''}
                        onChange={e => setVal(e.target.value)}
                      />
                    )}
                  </div>
                )
              })}
            </div>

            <div className={styles.modalActions}>
              <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setShowNewLead(false)}>Cancelar</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={createLead} disabled={saving || !fLead.company_name.trim() || !fLead.stage_id}>
                {saving ? 'Salvando...' : 'Criar Lead'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Drawer: Lead Detail Panel ─────────────────────────────────────── */}
      {showEditLead && editLead && (
        <LeadDetailPanel
          lead={editLead}
          stages={stages}
          pipelineFields={pipelineFields}
          initialTab={initialTab}
          open={showEditLead}
          onClose={() => {
            setShowEditLead(false); setEditLead(null);
            // Atualiza somente as tarefas do lead que foi fechado (evita recarregar tudo do time)
            const closedLeadId = editLead?.id
            if (closedLeadId) {
              crmCall('crm-manage-tasks', { action: 'list', lead_id: closedLeadId }).then(res => {
                if (!res.error && res.tasks) {
                  setPipelineTasks(prev => {
                    const others = prev.filter(t => t.lead_id !== closedLeadId)
                    return [...others, ...(res.tasks as CrmTask[]).filter(t => t.status === 'pendente')]
                  })
                }
              })
            }
          }}
          onUpdate={(updated) => {
            setLeads(prev => prev.map(l => l.id === updated.id ? updated : l))
            setEditLead(updated)
          }}
          onDelete={(leadId) => {
            setLeads(prev => prev.filter(l => l.id !== leadId))
            setShowEditLead(false)
            setEditLead(null)
            showToast('Lead excluído.')
          }}
        />
      )}

      {/* ── Modal: Gerenciar Etapas ──────────────────────────────────────── */}
      {showManageStages && (
        <div className={styles.overlay} onClick={() => setShowManageStages(false)}>
          <div className={`${styles.modal} ${styles.modalWide}`} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Gerenciar Etapas</h2>
            <p style={{ fontSize: 12, color: '#4a5168', margin: '-8px 0 0' }}>
              Edite nome e cor de cada etapa. Etapas com leads não podem ser excluídas.
            </p>
            <div className={styles.stagesList}>
              <DndContext sensors={sensors} collisionDetection={rectIntersection} onDragEnd={handleStageDragEnd}>
                <SortableContext items={stageEdits.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  {stageEdits.map((se) => {
                    const leadsCount = leads.filter(l => l.stage_id === se.id).length
                    return (
                      <SortableStageRow
                        key={se.id}
                        se={se}
                        leadsCount={leadsCount}
                        saving={saving}
                        onDelete={() => deleteStage(se.id)}
                        onChangeName={(val) => setStageEdits(prev => prev.map(s => s.id === se.id ? { ...s, name: val } : s))}
                        onChangeColor={(val) => setStageEdits(prev => prev.map(s => s.id === se.id ? { ...s, color: val } : s))}
                        styles={styles}
                      />
                    )
                  })}
                </SortableContext>
              </DndContext>
            </div>
            <div className={styles.addStageRow}>
              <input
                className={styles.addStageInput}
                placeholder="+ Nome da nova etapa"
                value={newStageName}
                onChange={e => setNewStageName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveStages()}
              />
            </div>
            <div className={styles.modalActions}>
              <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setShowManageStages(false)}>Cancelar</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveStages} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirmar Delete Funil ────────────────────────────────── */}
      {showDeletePipeline && (
        <div className={styles.overlay} onClick={() => setShowDeletePipeline(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Excluir Funil</h2>
            <p style={{ fontSize: 14, color: '#a1a1aa', margin: 0 }}>
              Tem certeza que quer excluir o funil <strong style={{ color: '#f0f2f5' }}>"{activePipeline?.name}"</strong>?
              <br /><br />
              <span style={{ color: '#f87171' }}>⚠ Esta ação é irreversível. Todos os leads e etapas serão excluídos.</span>
            </p>
            <div className={styles.modalActions}>
              <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setShowDeletePipeline(false)}>Cancelar</button>
              <button className={`${styles.btn} ${styles.btnDanger}`} onClick={deletePipeline} disabled={saving}>
                {saving ? 'Excluindo...' : 'Sim, excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PipelinePage() {
  return (
    <Suspense fallback={<NGPLoading loading={true} />}>
      <PipelineContent />
    </Suspense>
  )
}
