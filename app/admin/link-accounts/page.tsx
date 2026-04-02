'use client'
import { useState, useEffect } from 'react'
import { getSession } from '@/lib/auth'
import { SURL, ANON } from '@/lib/constants'
import styles from './link-accounts.module.css'

interface MetaAccount {
  id: string
  name: string
  account_status: number
  currency: string
}

interface Cliente {
  id: string
  username: string
  nome: string
  meta_account_id: string | null
  foto_url: string | null
}

export default function LinkAccountsPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [accounts, setAccounts] = useState<MetaAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [linking, setLinking] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      const sess = getSession()
      if (!sess?.session) {
        setError('Sessão inválida')
        return
      }

      // Carregar clientes
      const clientesRes = await fetch(`${SURL}/functions/v1/get-ngp-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON
        },
        body: JSON.stringify({ session_token: sess.session })
      })
      const clientesData = await clientesRes.json()
      if (clientesRes.ok && clientesData.clientes) {
        setClientes(clientesData.clientes)
      }

      // Descobrir contas Meta
      const accountsRes = await fetch(`${SURL}/functions/v1/discover-meta-accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON
        },
        body: JSON.stringify({ session_token: sess.session })
      })
      const accountsData = await accountsRes.json()
      if (accountsRes.ok && accountsData.accounts) {
        setAccounts(accountsData.accounts)
      }

      setError('')
    } catch (e) {
      setError('Erro ao carregar dados: ' + (e instanceof Error ? e.message : 'Tente novamente'))
    } finally {
      setLoading(false)
    }
  }

  async function linkAccount(clienteId: string, metaAccountId: string) {
    try {
      setLinking(clienteId)
      const sess = getSession()
      if (!sess?.session) return

      const res = await fetch(`${SURL}/functions/v1/link-client-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON
        },
        body: JSON.stringify({
          session_token: sess.session,
          cliente_id: clienteId,
          meta_account_id: metaAccountId
        })
      })

      if (res.ok) {
        // Atualizar lista local
        setClientes(clientes.map(c =>
          c.id === clienteId ? { ...c, meta_account_id: metaAccountId } : c
        ))
      } else {
        const data = await res.json()
        setError(data.error || 'Erro ao vincular conta')
      }
    } catch (e) {
      setError('Erro: ' + (e instanceof Error ? e.message : 'Tente novamente'))
    } finally {
      setLinking(null)
    }
  }

  if (loading) return <div className={styles.container}><p>Carregando...</p></div>

  return (
    <div className={styles.container}>
      <h1>Vincular Contas Meta aos Clientes</h1>
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.grid}>
        {clientes.map(cliente => (
          <div key={cliente.id} className={styles.clienteCard}>
            <div className={styles.clienteInfo}>
              {cliente.foto_url && <img src={cliente.foto_url} alt={cliente.nome} />}
              <div>
                <h3>{cliente.nome}</h3>
                <p>{cliente.username}</p>
                {cliente.meta_account_id && (
                  <p className={styles.linked}>✓ Vinculado: {cliente.meta_account_id}</p>
                )}
              </div>
            </div>

            {!cliente.meta_account_id && (
              <div className={styles.accountSelect}>
                <p>Selecione uma conta Meta:</p>
                <div className={styles.accountList}>
                  {accounts.map(account => (
                    <button
                      key={account.id}
                      onClick={() => linkAccount(cliente.id, account.id)}
                      disabled={linking === cliente.id}
                      className={styles.accountBtn}
                    >
                      {account.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
