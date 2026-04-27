'use client'
import React from 'react'
import { CrmLead, CrmStage, CrmTask } from '@/lib/crm-api'
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

const TEMP_DOT: Record<string, { color: string; emoji: string; label: string }> = {
  hot:  { color: '#dc2626', emoji: '🔥', label: 'Quente'  },
  warm: { color: '#d97706', emoji: '🌡️', label: 'Morno'   },
  cold: { color: '#2563eb', emoji: '❄️', label: 'Frio'    },
}

interface LeadCardProps {
  lead: CrmLead
  tasks?: CrmTask[]
  onEdit: (l: CrmLead, targetTab?: 'dados' | 'timeline' | 'tarefas') => void
  overlay?: boolean
  styles: any
}

export const LeadCard = React.memo(function LeadCard({ lead, tasks, onEdit, overlay, styles }: LeadCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lead.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  const pendingTasks = tasks?.filter(t => t.status === 'pendente') || []
  const today = new Date().toDateString()
  const overdueCount = pendingTasks.filter(t => new Date(t.due_date) < new Date(today)).length
  const pendingCount = pendingTasks.length - overdueCount

  const tempInfo = lead.temperature ? TEMP_DOT[lead.temperature] : null

  return (
    <div
      ref={setNodeRef} style={style} {...attributes} {...listeners}
      className={`${styles.leadCard} ${isDragging ? styles.leadCardDragging : ''} ${overlay ? styles.leadCardOverlay : ''}`}
      onClick={(e) => {
        if (!isDragging) onEdit(lead)
      }}
    >
      <div className={styles.leadHeader}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflow: 'hidden', flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {tempInfo && (
              <span
                className={styles.leadTempDot}
                style={{ background: tempInfo.color }}
                title={`Lead ${tempInfo.label}`}
              />
            )}
            <div className={styles.leadCompany} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.company_name}</div>
          </div>
          <div className={styles.leadBadges}>
            {overdueCount > 0 && <span className={styles.leadBadgeOverdue} title={`${overdueCount} tarefa(s) precisando de atenção`} />}
            {overdueCount === 0 && pendingCount > 0 && <span className={styles.leadBadgePending} title={`${pendingCount} tarefa(s) em dia`} />}
          </div>
        </div>

        <button
          className={styles.leadTaskBtn}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onEdit(lead, 'tarefas') }}
          title="Nova tarefa"
        >
          Nova Tarefa
        </button>
      </div>
      {lead.contact_name && <div className={styles.leadContact}>{lead.contact_name}</div>}
      <div className={styles.leadValue}>{fmt(lead.estimated_value)}</div>

      <div className={styles.leadFooter}>
        <span className={styles.leadEditLabel}>editar ✎</span>
      </div>
    </div>
  )
})

interface KanbanColumnProps {
  stage: CrmStage
  leads: CrmLead[]
  allTasks: CrmTask[]
  onEdit: (l: CrmLead, targetTab?: 'dados' | 'timeline' | 'tarefas') => void
  onAddLead: (stageId: string) => void
  styles: any
}

export const KanbanColumn = React.memo(function KanbanColumn({ stage, leads, allTasks, onEdit, onAddLead, styles }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })
  return (
    <div className={`${styles.column} ${isOver ? styles.columnOver : ''}`}>
      <div className={styles.columnHeader}>
        <div className={styles.columnDot} style={{ background: stage.color }} />
        <span className={styles.columnName}>{stage.name}</span>
        <span className={styles.columnCount}>{leads.length}</span>
      </div>
      <div ref={setNodeRef} className={styles.columnBody}>
        <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map(lead => <LeadCard key={lead.id} lead={lead} tasks={allTasks.filter(t => t.lead_id === lead.id)} onEdit={onEdit} styles={styles} />)}
        </SortableContext>
        {leads.length === 0 && (
          <button className={styles.emptyColumn} onClick={() => onAddLead(stage.id)}>
            + Adicionar lead
          </button>
        )}
      </div>
    </div>
  )
})
