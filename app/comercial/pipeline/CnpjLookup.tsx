'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { CrmPipelineField } from '@/lib/crm-api'
import styles from './pipeline.module.css'

// ── Types ──────────────────────────────────────────────────────────────────────
export interface CnpjData {
  razao_social: string
  nome_fantasia: string
  email: string | null
  ddd_telefone_1: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  municipio: string
  uf: string
  cep: string
  situacao_cadastral: string
  descricao_situacao_cadastral: string
}

export interface CnpjImportField {
  key: string
  label: string
  value: string
  fieldName?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function formatCnpj(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`
}

// ── CnpjImportModal ───────────────────────────────────────────────────────────
export function CnpjImportModal({
  data,
  pipelineFields,
  customFields,
  onApply,
  onClose,
}: {
  data: CnpjData
  pipelineFields: CrmPipelineField[]
  customFields: Record<string, any>
  onApply: (selected: CnpjImportField[]) => void
  onClose: () => void
}) {
  const endereco      = [data.logradouro, data.numero, data.complemento, data.bairro].filter(Boolean).join(', ')
  const cepFmt        = data.cep?.replace(/^(\d{5})(\d{3})$/, '$1-$2') || data.cep
  const cidade        = data.municipio || ''
  const inatvo        = data.situacao_cadastral !== '2'
  const situacaoLabel = data.descricao_situacao_cadastral || data.situacao_cadastral

  const cidadeField = pipelineFields.find(f => /cidade/i.test(f.name))
  const whatsField  = pipelineFields.find(f => /whatsapp|telefone|fone/i.test(f.name))
  const emailField  = pipelineFields.find(f => /e-?mail/i.test(f.name) && !f.type.startsWith('system_'))
  const cepField    = pipelineFields.find(f => /cep/i.test(f.name))
  const endField    = pipelineFields.find(f => /endere[çc]/i.test(f.name))

  const allFields: CnpjImportField[] = (([
    { key: 'empresa', label: 'Empresa',                                              value: data.nome_fantasia || data.razao_social, fieldName: '_company_name' },
    cidade             ? { key: 'cidade', label: `Cidade → "${cidadeField?.name || 'Cidade'}"`,         value: cidade,                   fieldName: cidadeField?.name } : null,
    data.email         ? { key: 'email',  label: `E-mail → "${emailField?.name || 'E-mail'}"`,         value: data.email.toLowerCase(), fieldName: emailField?.name  } : null,
    data.ddd_telefone_1 ? { key: 'tel',   label: `Telefone → "${whatsField?.name || 'Telefone'}"`,     value: data.ddd_telefone_1,      fieldName: whatsField?.name  } : null,
    cepFmt && cepField  ? { key: 'cep',   label: `CEP → "${cepField.name}"`,                           value: cepFmt,                   fieldName: cepField.name     } : null,
    endereco && endField ? { key: 'end',  label: `Endereço → "${endField.name}"`,                      value: endereco,                 fieldName: endField.name     } : null,
  ] as (CnpjImportField | null)[]).filter((f): f is CnpjImportField => !!f && !!f.value && !!f.fieldName))

  const [selected, setSelected] = useState<Set<string>>(() => new Set(allFields.map(f => f.key)))

  const toggle    = (key: string) => setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  const allChecked = selected.size === allFields.length
  const toggleAll  = () => setSelected(allChecked ? new Set() : new Set(allFields.map(f => f.key)))

  return (
    <>
      <div className={styles.cnpjModalBackdrop} onClick={onClose} />
      <div className={styles.cnpjModal}>
        <div className={styles.cnpjModalHeader}>
          <div>
            <div className={styles.cnpjModalTitle}>🏢 Importar dados do CNPJ</div>
            <div className={styles.cnpjModalSub}>
              {data.nome_fantasia || data.razao_social}
              {data.razao_social && data.nome_fantasia && <span style={{ color: '#94a3b8' }}> · {data.razao_social}</span>}
            </div>
          </div>
          <span className={`${styles.cnpjSitBadge} ${inatvo ? styles.cnpjSitInativo : styles.cnpjSitAtivo}`}>{situacaoLabel}</span>
        </div>

        <div className={styles.cnpjModalSelectAll}>
          <label className={styles.cnpjCheckRow} style={{ fontWeight: 700 }}>
            <input type="checkbox" checked={allChecked} onChange={toggleAll} />
            <span>Selecionar todos</span>
          </label>
        </div>

        <div className={styles.cnpjModalFields}>
          {allFields.map(f => (
            <label key={f.key} className={`${styles.cnpjCheckRow} ${!selected.has(f.key) ? styles.cnpjCheckRowOff : ''}`}>
              <input type="checkbox" checked={selected.has(f.key)} onChange={() => toggle(f.key)} />
              <div className={styles.cnpjCheckInfo}>
                <span className={styles.cnpjCheckLabel}>{f.label}</span>
                <span className={styles.cnpjCheckValue}>{f.value}</span>
              </div>
            </label>
          ))}
          {allFields.length === 0 && <div className={styles.cnpjModalEmpty}>Nenhum campo mapeado encontrado no pipeline.</div>}
        </div>

        <div className={styles.cnpjModalActions}>
          <button className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} onClick={onClose}>Cancelar</button>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={selected.size === 0}
            onClick={() => { onApply(allFields.filter(f => selected.has(f.key))); onClose() }}
          >
            ⬇ Importar {selected.size > 0 ? `${selected.size} campo${selected.size > 1 ? 's' : ''}` : ''}
          </button>
        </div>
      </div>
    </>
  )
}

// ── CnpjLookupCard ────────────────────────────────────────────────────────────
export function CnpjLookupCard({
  cnpj,
  pipelineFields,
  customFields,
  onFill,
}: {
  cnpj: string
  pipelineFields: CrmPipelineField[]
  customFields: Record<string, any>
  onFill: (fields: CnpjImportField[]) => void
}) {
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [data, setData]           = useState<CnpjData | null>(null)
  const [showModal, setShowModal] = useState(false)
  const lastQueried               = useRef('')

  const lookup = useCallback(async (rawCnpj: string) => {
    const digits = rawCnpj.replace(/\D/g, '')
    if (digits.length !== 14) { setData(null); setError(''); return }
    if (digits === lastQueried.current) return
    lastQueried.current = digits
    setLoading(true); setError(''); setData(null)
    try {
      const res = await fetch(`https://publica.cnpj.ws/cnpj/${digits}`)
      if (res.status === 404) { setError('CNPJ não encontrado na Receita Federal.'); setLoading(false); return }
      if (res.status === 429) { setError('Muitas consultas. Aguarde um momento.'); setLoading(false); return }
      if (!res.ok)            { setError(`Erro ao consultar CNPJ (${res.status}).`); setLoading(false); return }
      setData(await res.json())
    } catch { setError('Não foi possível consultar o CNPJ.') }
    setLoading(false)
  }, [])

  useEffect(() => {
    const digits = cnpj.replace(/\D/g, '')
    if (digits.length === 14) lookup(digits)
    else { setData(null); setError(''); lastQueried.current = '' }
  }, [cnpj, lookup])

  if (loading) return (
    <div className={styles.cnpjCard}>
      <div className={styles.cnpjCardLoading}><div className={styles.cnpjSpinner} /><span>Consultando Receita Federal...</span></div>
    </div>
  )
  if (error)  return <div className={`${styles.cnpjCard} ${styles.cnpjCardError}`}>⚠️ {error}</div>
  if (!data)  return null

  const inatvo        = data.situacao_cadastral !== '2'
  const situacaoLabel = data.descricao_situacao_cadastral || data.situacao_cadastral

  return (
    <>
      <div className={styles.cnpjCard}>
        <div className={styles.cnpjCardHeader}>
          <div>
            <div className={styles.cnpjCardTitle}>🏢 {data.nome_fantasia || data.razao_social}</div>
            {data.razao_social && data.nome_fantasia && <div className={styles.cnpjCardSub}>{data.razao_social}</div>}
          </div>
          <span className={`${styles.cnpjSitBadge} ${inatvo ? styles.cnpjSitInativo : styles.cnpjSitAtivo}`}>{situacaoLabel}</span>
        </div>
        <button className={styles.cnpjApplyBtn} onClick={() => setShowModal(true)}>
          ⬇ Importar dados para os campos
        </button>
      </div>
      {showModal && (
        <CnpjImportModal
          data={data}
          pipelineFields={pipelineFields}
          customFields={customFields}
          onApply={onFill}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}
