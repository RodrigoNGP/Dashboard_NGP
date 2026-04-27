'use client'
import { useState, useEffect } from 'react'
import { getSession, setSession } from '@/lib/auth'
import { SURL } from '@/lib/constants'
import { efHeaders } from '@/lib/api'
import styles from './AccountSelector.module.css'
import CustomSelect, { SelectOption } from './CustomSelect'

interface Cliente {
  id: string
  username: string
  nome: string
  meta_account_id: string | null
  foto_url: string | null
}

export default function AccountSelector() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [currentAccount, setCurrentAccount] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAccounts()
  }, [])

  async function loadAccounts() {
    try {
      const sess = getSession()
      if (!sess?.session || (sess.role !== 'ngp' && sess.role !== 'admin')) return

      const res = await fetch(`${SURL}/functions/v1/get-ngp-data`, {
        method: 'POST',
        headers: efHeaders(),
        body: JSON.stringify({ session_token: sess.session })
      })

      const data = await res.json()
      if (res.ok && data.clientes) {
        setClientes(data.clientes.filter((c: Cliente) => c.meta_account_id))
      }

      const current = sessionStorage.getItem('ngp_viewing_account')
      setCurrentAccount(current)
    } catch (e) {
      console.error('Erro ao carregar contas:', e)
    } finally {
      setLoading(false)
    }
  }

  function handleAccountChange(accountId: string) {
    const cliente = clientes.find(c => c.meta_account_id === accountId)
    if (!cliente) return

    sessionStorage.setItem('ngp_viewing_account', accountId)
    sessionStorage.setItem('ngp_viewing_name', cliente.nome)
    sessionStorage.setItem('ngp_viewing_username', cliente.username)
    sessionStorage.setItem('ngp_viewing_id', cliente.id)
    setCurrentAccount(accountId)
    window.location.reload()
  }

  const options: SelectOption[] = clientes.map(c => ({
    id: c.meta_account_id!,
    label: c.nome,
    subLabel: c.meta_account_id!,
    image: c.foto_url || undefined
  }))

  if (loading || clientes.length === 0) return null

  return (
    <div className={styles.container}>
      <CustomSelect
        caption="Conta do cliente"
        value={currentAccount || ''}
        options={options}
        onChange={handleAccountChange}
        placeholder="Selecionar cliente..."
      />
    </div>
  )
}
