'use client'
import React from 'react'
import { CrmStage, CrmPipelineField } from '@/lib/crm-api'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import CustomSelect from '@/components/CustomSelect'

export const getBaseType = (type: string) => type.split(':')[0]
export const getFieldWidth = (type: string): 'full' | 'half' => type.includes(':half') ? 'half' : 'full'

export const CurrencyInput = ({ value, onChange, className }: { value: number | string; onChange: (v: number) => void; className?: string }) => {
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

export function SortableStageRow({ se, leadsCount, onDelete, onChangeName, onChangeColor, saving, styles }: { se: any, leadsCount: number, onDelete: () => void, onChangeName: (v: string) => void, onChangeColor: (v: string) => void, saving: boolean, styles: any }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: se.id })
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : 1, position: 'relative' as any }
  return (
    <div ref={setNodeRef} style={style} className={styles.stageRow}>
      <button 
        type="button" 
        style={{ background: 'transparent', border: 'none', color: '#6B7280', cursor: isDragging ? 'grabbing' : 'grab', padding: '4px', display: 'flex', alignItems: 'center' }} 
        {...attributes} 
        {...listeners} 
        disabled={saving}
        title="Arraste para reordenar"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
          <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
      </button>
      <input type="color" className={styles.stageColorInput} value={se.color} onChange={e => onChangeColor(e.target.value)} disabled={saving} />
      <input className={styles.stageNameInput} value={se.name} onChange={e => onChangeName(e.target.value)} disabled={saving} />
      <span className={styles.stageLeadCount}>{leadsCount} lead{leadsCount !== 1 ? 's' : ''}</span>
      <div className={styles.stageActions}>
        <button className={styles.stageDeleteBtn} onClick={onDelete} disabled={leadsCount > 0 || saving} title={leadsCount > 0 ? 'Mova os leads antes de excluir' : 'Excluir etapa'}>×</button>
      </div>
    </div>
  )
}

export function SortableFieldRow({ 
  field, onDelete, onChangeName, onChangeType, onChangeOptions, saving, index, total, styles 
}: { 
  field: CrmPipelineField, 
  onDelete: () => void, 
  onChangeName: (v: string) => void, 
  onChangeType: (v: string) => void, 
  onChangeOptions: (v: string[]) => void, 
  saving: boolean,
  index: number,
  total: number,
  styles: any
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id })
  const baseType = getBaseType(field.type)
  const isHalf = getFieldWidth(field.type) === 'half'
  
  const style = { 
    transform: CSS.Transform.toString(transform), 
    transition, 
    zIndex: isDragging ? 1000 : (total - index), 
    position: 'relative' as any, 
    display: 'flex', 
    flexDirection: 'column' as any,
    gap: 8, 
    padding: '16px',
    background: '#ffffff',
    border: isDragging ? '1px solid #3b82f6' : '1px solid #e2e8f0',
    borderRadius: 8,
    marginBottom: 12,
    boxShadow: isDragging ? '0 10px 20px rgba(59, 130, 246, 0.1)' : 'none'
  }

  const toggleWidth = () => {
    const newType = isHalf ? baseType : `${baseType}:half`
    onChangeType(newType)
  }

  return (
    <div ref={setNodeRef} style={style}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button type="button" style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: isDragging ? 'grabbing' : 'grab', padding: '4px' }} {...attributes} {...listeners} disabled={saving}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width={16} height={16}>
            <circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/>
            <circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>
          </svg>
        </button>

        <input 
          className={styles.stageNameInput} 
          style={{ flex: 1, fontWeight: 600, border: 'none', paddingLeft: 0, borderBottom: '1px solid transparent' }} 
          value={field.name} 
          onChange={e => onChangeName(e.target.value)} 
          disabled={saving} 
          placeholder="Nome do campo"
        />

        <CustomSelect
          caption="Tipo de Campo"
          value={baseType}
          options={[
            { id: 'system_stage_id', label: 'Etapa' },
            { id: 'system_contact_name', label: 'Contato' },
            { id: 'system_source', label: 'Origem' },
            { id: 'system_phone', label: 'Telefone' },
            { id: 'system_email', label: 'Email' },
            { id: 'system_estimated_value', label: 'Valor' },
            { id: 'system_notes', label: 'Obs' },
            { id: 'text', label: 'Texto Curto' },
            { id: 'longtext', label: 'Texto Longo' },
            { id: 'number', label: 'Número' },
            { id: 'currency', label: 'Moeda' },
            { id: 'cnpj', label: 'CNPJ/CPF' },
            { id: 'date', label: 'Data' },
            { id: 'select', label: 'Múltipla Escolha' },
          ]}
          onChange={val => onChangeType(isHalf ? `${val}:half` : val)}
          disabled={saving}
        />

        <button 
          className={styles.btn} 
          title="Alternar largura entre Pequeno (50%) e Grande (100%)"
          style={{ width: 85, fontSize: 11, background: isHalf ? '#eff6ff' : '#f8fafc', color: isHalf ? '#2563eb' : '#64748b', border: isHalf ? '1px solid #bfdbfe' : '1px solid #e2e8f0' }}
          onClick={toggleWidth}
          disabled={baseType === 'longtext' || baseType === 'system_notes' || saving}
        >
          {isHalf ? 'Pequeno' : 'Grande'}
        </button>

        <button className={styles.stageDeleteBtn} style={{ color: '#ef4444' }} onClick={onDelete} disabled={saving}>×</button>
      </div>

      {baseType === 'select' && (
        <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 28 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Opções da Lista</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(field.options || []).map((opt, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 4px' }}>
                <input 
                  style={{ border: 'none', background: 'transparent', fontSize: 12, padding: 2, width: 80 }}
                  value={opt}
                  onChange={e => {
                    const newOpts = [...(field.options || [])]
                    newOpts[idx] = e.target.value
                    onChangeOptions(newOpts)
                  }}
                  disabled={saving}
                />
                <button 
                  style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', padding: '0 4px', fontSize: 14 }}
                  onClick={() => onChangeOptions((field.options || []).filter((_, i) => i !== idx))}
                  disabled={saving}
                >
                  ×
                </button>
              </div>
            ))}
            <button 
              className={styles.btnSm}
              style={{ background: '#fff', border: '1px dashed #cbd5e1', color: '#3b82f6', fontSize: 12 }}
              onClick={() => onChangeOptions([...(field.options || []), 'Nova opção'])}
              disabled={saving}
            >
              + Opção
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function SortablePreviewField({ field, styles }: { field: CrmPipelineField, styles: any }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id })
  const baseType = getBaseType(field.type)
  const isHalf = getFieldWidth(field.type) === 'half' && baseType !== 'longtext' && baseType !== 'system_notes'
  
  const style = { 
    transform: CSS.Transform.toString(transform), 
    transition, 
    zIndex: isDragging ? 2 : 1, 
    opacity: isDragging ? 0.5 : 1,
    flex: isHalf ? '0 0 calc(50% - 6px)' : '0 0 100%'
  }

  return (
    <div ref={setNodeRef} style={style} className={styles.field}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
        <label style={{ cursor: 'grab', display: 'flex', alignItems: 'center', gap: 6 }} {...attributes} {...listeners}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#adb5bd" strokeWidth="2" width={12} height={12}>
            <circle cx="9" cy="9" r="1"/><circle cx="9" cy="15" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="15" cy="15" r="1"/>
          </svg>
          {field.name}
        </label>
      </div>
      {baseType === 'longtext' || baseType === 'system_notes' ? (
        <textarea disabled placeholder="..." style={{ background: '#ffffff', height: 60, border: '1px solid #e2e8f0' }} />
      ) : (baseType === 'select' || baseType === 'system_stage_id') ? (
        <CustomSelect
          caption="Campo"
          value="Selecione..."
          options={baseType === 'select' ? (field.options || []).map(o => ({ id: o, label: o })) : [{ id: 'opt', label: 'Opções do Pipeline' }]}
          onChange={() => {}}
          disabled={true}
        />
      ) : baseType === 'currency' || baseType === 'system_estimated_value' ? (
        <input disabled placeholder="R$ 0,00" style={{ background: '#ffffff', border: '1px solid #e2e8f0' }} />
      ) : (
        <input disabled placeholder="..." style={{ background: '#ffffff', border: '1px solid #e2e8f0' }} />
      )}
    </div>
  )
}
