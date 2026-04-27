'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { efCall } from '@/lib/api'
import Sidebar from '@/components/Sidebar'
import { comercialNav } from '../comercial-nav'
import { createChatSupabaseClient } from '@/lib/chat-supabase'
import styles from './chat.module.css'

interface WaInstance {
  id: string
  instance_name: string
  display_name: string
  status: string
}

interface Conversation {
  remote_jid: string
  phone_normalized: string | null
  instance_name: string
  last_body: string | null
  last_ts: string
  unread: number
  push_name: string | null
  lead_name: string | null
  from_me_last: boolean
  profile_picture_url?: string | null
  chat_type: 'direct' | 'group'
}

interface Message {
  id: string
  evolution_message_id?: string | null
  body: string | null
  from_me: boolean
  message_type: string
  ai_suggestion: string | null
  message_timestamp: string | null
  created_at: string
  metadata: { pushName?: string | null; client_message_id?: string | null; pending?: boolean; confirmed?: boolean }
}

function getMessageSortTime(message: Pick<Message, 'message_timestamp' | 'created_at'>) {
  return new Date(message.message_timestamp || message.created_at).getTime()
}

function sortMessages<T extends Pick<Message, 'message_timestamp' | 'created_at'>>(list: T[]) {
  return [...list].sort((a, b) => getMessageSortTime(a) - getMessageSortTime(b))
}

function sortConversations(list: Conversation[]) {
  return [...list].sort((a, b) => new Date(b.last_ts).getTime() - new Date(a.last_ts).getTime())
}

function getChatType(remoteJid: string): 'direct' | 'group' {
  return remoteJid.includes('@g.us') ? 'group' : 'direct'
}

function fmtTime(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'ontem'
  if (diffDays < 7) return d.toLocaleDateString('pt-BR', { weekday: 'short' })
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function fmtFull(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function displayName(conv: Conversation) {
  return conv.lead_name || conv.push_name || conv.phone_normalized || conv.remote_jid.replace(/@.*$/, '')
}

function remoteJidLocalPart(remoteJid: string) {
  return remoteJid.replace(/@.*$/, '')
}

function isFallbackDisplayName(name: string | null | undefined, remoteJid: string) {
  if (!name) return true
  return name.trim() === remoteJidLocalPart(remoteJid)
}

function getCanonicalDisplayNameFallback(conversations: Conversation[]) {
  const fallbackMap = new Map<string, string>()

  for (const conv of conversations) {
    const localPart = remoteJidLocalPart(conv.remote_jid)
    const hasMeaningfulName = !isFallbackDisplayName(conv.push_name, conv.remote_jid)
    if (!hasMeaningfulName) continue

    const existing = fallbackMap.get(`${conv.instance_name}::${localPart}`)
    if (!existing) {
      fallbackMap.set(`${conv.instance_name}::${localPart}`, conv.push_name as string)
    }
  }

  return fallbackMap
}

function applyCompanionDisplayNameFallback(conversations: Conversation[]) {
  const fallbackMap = getCanonicalDisplayNameFallback(conversations)

  return conversations.map(conv => {
    if (!conv.remote_jid.endsWith('@lid')) return conv
    if (!isFallbackDisplayName(conv.push_name, conv.remote_jid)) return conv

    const companionName = fallbackMap.get(`${conv.instance_name}::${remoteJidLocalPart(conv.remote_jid)}`)
    if (!companionName) return conv

    return {
      ...conv,
      push_name: companionName,
    }
  })
}

function conversationKey(conv: Pick<Conversation, 'instance_name' | 'remote_jid'>) {
  return `${conv.instance_name}::${conv.remote_jid}`
}

function ConversationAvatar({ conv, className }: { conv: Conversation; className: string }) {
  if (conv.profile_picture_url) {
    return (
      <img
        src={conv.profile_picture_url}
        alt={displayName(conv)}
        className={className}
      />
    )
  }

  return (
    <div className={className}>
      {(displayName(conv)[0] || '?').toUpperCase()}
    </div>
  )
}

// ── Modal de conexão via QR ───────────────────────────────────────────────────
function ConnectModal({ onClose, onConnected }: { onClose: () => void; onConnected: (inst: WaInstance) => void }) {
  const [step, setStep] = useState<'form' | 'qr' | 'connected'>('form')
  const [instanceName, setInstanceName] = useState('')
  const [displayNameVal, setDisplayNameVal] = useState('')
  const [qrBase64, setQrBase64] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const qrRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const createdInstance = useRef<string>('')

  function clearPolling() {
    if (pollRef.current) clearInterval(pollRef.current)
    if (qrRefreshRef.current) clearInterval(qrRefreshRef.current)
  }

  useEffect(() => () => clearPolling(), [])

  async function handleCreate() {
    const name = instanceName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
    if (!name) { setError('Nome inválido. Use letras, números, _ ou -.'); return }
    setLoading(true)
    setError('')
    const res = await efCall('whatsapp-connect', { action: 'create', instance_name: name, display_name: displayNameVal.trim() || name })
    setLoading(false)
    if (res.error) { setError(res.error as string); return }

    createdInstance.current = name
    setQrBase64((res.qr_code as string) || null)
    setStep('qr')

    // Polling de status a cada 3s
    pollRef.current = setInterval(async () => {
      const s = await efCall('whatsapp-connect', { action: 'status', instance_name: name })
      if (s.state === 'open') {
        clearPolling()
        setStep('connected')
        setTimeout(() => {
          onConnected({ id: '', instance_name: name, display_name: displayNameVal.trim() || name, status: 'connected' })
        }, 1500)
      }
    }, 3000)

    // Refresh do QR a cada 25s (expira em ~20s na Evolution)
    qrRefreshRef.current = setInterval(async () => {
      const q = await efCall('whatsapp-connect', { action: 'qr', instance_name: name })
      if (q.qr_code) setQrBase64(q.qr_code as string)
    }, 25000)
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>📱 Conectar WhatsApp</span>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        {step === 'form' && (
          <div className={styles.modalBody}>
            <p className={styles.modalDesc}>Crie uma instância para espelhar um número do WhatsApp no sistema.</p>
            <label className={styles.modalLabel}>Nome da instância <span style={{ color: '#94a3b8', fontWeight: 400 }}>(sem espaços)</span></label>
            <input
              className={styles.modalInput}
              placeholder="ex: arthur-ngp"
              value={instanceName}
              onChange={e => setInstanceName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <label className={styles.modalLabel} style={{ marginTop: 12 }}>Nome de exibição</label>
            <input
              className={styles.modalInput}
              placeholder="ex: Arthur NGP"
              value={displayNameVal}
              onChange={e => setDisplayNameVal(e.target.value)}
            />
            {error && <p className={styles.modalError}>{error}</p>}
            <button className={styles.modalBtn} disabled={loading} onClick={handleCreate}>
              {loading ? 'Criando...' : 'Gerar QR Code →'}
            </button>
          </div>
        )}

        {step === 'qr' && (
          <div className={styles.modalBody} style={{ alignItems: 'center' }}>
            <p className={styles.modalDesc}>Abra o WhatsApp no celular → <strong>Aparelhos conectados</strong> → <strong>Conectar aparelho</strong> e escaneie:</p>
            {qrBase64 ? (
              <img
                src={qrBase64.startsWith('data:') ? qrBase64 : `data:image/png;base64,${qrBase64}`}
                alt="QR Code WhatsApp"
                className={styles.qrImage}
              />
            ) : (
              <div className={styles.qrPlaceholder}>Carregando QR...</div>
            )}
            <p className={styles.qrHint}>QR atualiza automaticamente a cada 25s • Aguardando conexão...</p>
            {error && <p className={styles.modalError}>{error}</p>}
          </div>
        )}

        {step === 'connected' && (
          <div className={styles.modalBody} style={{ alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 56 }}>✅</div>
            <p style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', margin: 0 }}>WhatsApp conectado!</p>
            <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Redirecionando para o chat...</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function ChatPage() {
  const router = useRouter()
  const supabase = useRef(createChatSupabaseClient()).current
  const [instances, setInstances] = useState<WaInstance[]>([])
  const [activeInstance, setActiveInstance] = useState<WaInstance | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingInstances, setLoadingInstances] = useState(true)
  const [loadingConvs, setLoadingConvs] = useState(false)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState('')
  const [search, setSearch] = useState('')
  const [chatFilter, setChatFilter] = useState<'all' | 'direct' | 'group'>('all')
  const [inputValue, setInputValue] = useState('')
  const [sendingCount, setSendingCount] = useState(0)
  const [sendError, setSendError] = useState('')
  const [appliedSuggestion, setAppliedSuggestion] = useState<string | null>(null)
  const [showConnect, setShowConnect] = useState(false)
  const [suggestionsEnabled, setSuggestionsEnabled] = useState(true)
  const [savingSuggestions, setSavingSuggestions] = useState(false)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const feedRef = useRef<HTMLDivElement>(null)
  const pendingMessagesRef = useRef<Record<string, Message[]>>({})
  const selectedRef = useRef<Conversation | null>(null)
  const profileSyncSignatureRef = useRef('')
  const messagesRequestKeyRef = useRef('')
  const settingsRequestKeyRef = useRef('')

  useEffect(() => {
    const s = getSession()
    if (!s) router.replace('/login')
  }, [router])

  useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight
  }, [messages])

  const mergePendingMessages = useCallback((conv: Pick<Conversation, 'instance_name' | 'remote_jid'>, serverMessages: Message[]) => {
    const key = conversationKey(conv)
    const pending = pendingMessagesRef.current[key] || []
    if (pending.length === 0) return serverMessages

    const confirmedClientIds = new Set(
      serverMessages
        .map(msg => msg.metadata?.client_message_id)
        .filter(Boolean)
    )

    const remainingPending = pending.filter(msg => !confirmedClientIds.has(msg.metadata?.client_message_id || ''))
    pendingMessagesRef.current[key] = remainingPending

    return sortMessages([...serverMessages, ...remainingPending])
  }, [])

  async function loadInstances() {
    setLoadingInstances(true)
    const res = await efCall('whatsapp-get-instances', {})
    const list = (res.instances as WaInstance[]) || []
    setInstances(list)
    if (list.length > 0) setActiveInstance(list[0])
    setLoadingInstances(false)
  }

  useEffect(() => { loadInstances() }, [])

  const loadConversations = useCallback(async (instance: WaInstance, options?: { preserveSelected?: boolean }) => {
    const preserveSelected = options?.preserveSelected === true
    setLoadingConvs(true)
    if (!preserveSelected) {
      setSelected(null)
      setMessages([])
    }

    const { data } = await supabase
      .from('chat_conversations')
      .select('canonical_remote_jid, remote_jid, phone_normalized, instance_name, display_name, profile_picture_url, last_message_preview, last_message_at, last_message_from_me, last_incoming_message_at, chat_type')
      .eq('instance_name', instance.instance_name)
      .order('last_message_at', { ascending: false })
      .limit(200)

    if (!data) { setLoadingConvs(false); return }

    const remoteJids = data.map(row => row.canonical_remote_jid)
    const settingsMap = new Map<string, { last_read_at: string | null }>()
    if (remoteJids.length > 0) {
      const { data: settings } = await supabase
        .from('chat_conversation_settings')
        .select('canonical_remote_jid, last_read_at')
        .eq('instance_name', instance.instance_name)
        .in('canonical_remote_jid', remoteJids)

      for (const row of settings || []) {
        settingsMap.set(row.canonical_remote_jid, { last_read_at: row.last_read_at || null })
      }
    }

    const diagnosticsMap = new Map<string, { latest_incoming_push_name: string | null; suspicious_self_name_collision: boolean }>()
    if (remoteJids.length > 0) {
      const { data: diagnostics } = await supabase
        .from('chat_identity_diagnostics')
        .select('canonical_remote_jid, latest_incoming_push_name, suspicious_self_name_collision')
        .eq('instance_name', instance.instance_name)
        .in('canonical_remote_jid', remoteJids)

      for (const row of diagnostics || []) {
        diagnosticsMap.set(row.canonical_remote_jid, {
          latest_incoming_push_name: row.latest_incoming_push_name || null,
          suspicious_self_name_collision: row.suspicious_self_name_collision === true,
        })
      }
    }

    const conversationsWithUnread = data.map(row => {
      const diagnostics = diagnosticsMap.get(row.canonical_remote_jid)
      const safeIncomingName =
        diagnostics?.latest_incoming_push_name && diagnostics.suspicious_self_name_collision !== true
          ? diagnostics.latest_incoming_push_name
          : null
      const resolvedDisplayName = !isFallbackDisplayName(row.display_name, row.canonical_remote_jid)
        ? row.display_name
        : safeIncomingName

      const conv: Conversation = {
        remote_jid: row.canonical_remote_jid,
        phone_normalized: row.phone_normalized,
        instance_name: row.instance_name,
        last_body: row.last_message_preview,
        last_ts: row.last_message_at || new Date().toISOString(),
        unread: 0,
        push_name: resolvedDisplayName || null,
        lead_name: null,
        from_me_last: row.last_message_from_me,
        profile_picture_url: row.profile_picture_url || null,
        chat_type: row.chat_type === 'group' ? 'group' : 'direct',
      }
      const lastReadAt = settingsMap.get(conv.remote_jid)?.last_read_at
      const lastIncomingAt = row.last_incoming_message_at
      const unread = lastIncomingAt && (!lastReadAt || new Date(lastIncomingAt).getTime() > new Date(lastReadAt).getTime()) ? 1 : 0

      return { ...conv, unread }
    })

    const nextConversations = sortConversations(conversationsWithUnread)
    const normalizedConversations = applyCompanionDisplayNameFallback(nextConversations)
    setConversations(normalizedConversations)

    if (preserveSelected) {
      const currentSelected = selectedRef.current
      if (currentSelected && currentSelected.instance_name === instance.instance_name) {
        const matchedConversation = normalizedConversations.find(conv => conv.remote_jid === currentSelected.remote_jid)
        if (matchedConversation) {
          setSelected(prev => prev && prev.instance_name === instance.instance_name && prev.remote_jid === matchedConversation.remote_jid
            ? { ...prev, ...matchedConversation, unread: 0 }
            : prev)
        } else {
          setSelected(null)
          setMessages([])
        }
      }
    }

    setLoadingConvs(false)
  }, [])

  const loadConversationProfiles = useCallback(async (instanceName: string, remoteJids: string[]) => {
    if (remoteJids.length === 0) return
    const expandedRemoteJids = [...new Set(
      remoteJids.flatMap(remoteJid =>
        remoteJid.endsWith('@lid')
          ? [remoteJid, `${remoteJidLocalPart(remoteJid)}@s.whatsapp.net`]
          : [remoteJid]
      )
    )]

    const res = await efCall('whatsapp-contact-profiles', {
      instance_name: instanceName,
      remote_jids: expandedRemoteJids,
    })

    const profiles = (res.profiles as Array<{ remote_jid: string; push_name: string | null; profile_picture_url: string | null }> | undefined) || []
    if (profiles.length === 0) return

    const profileMap = new Map(profiles.map((profile) => [profile.remote_jid, profile]))

    setConversations(prev => {
      let changed = false
      const next = prev.map(conv => {
        if (conv.instance_name !== instanceName) return conv
        const profile = profileMap.get(conv.remote_jid)
        if (!profile) return conv

        const nextPushName = profile.push_name ?? conv.push_name ?? null
        const nextProfilePicture = profile.profile_picture_url ?? conv.profile_picture_url ?? null

        if (nextPushName === conv.push_name && nextProfilePicture === conv.profile_picture_url) {
          return conv
        }

        changed = true
        return {
          ...conv,
          push_name: nextPushName,
          profile_picture_url: nextProfilePicture,
        }
      })

      const normalized = applyCompanionDisplayNameFallback(next)
      const companionAdjusted = normalized.some((conv, index) => conv.push_name !== next[index].push_name)

      return changed || companionAdjusted ? normalized : prev
    })

    setSelected(prev => {
      if (!prev || prev.instance_name !== instanceName) return prev
      const profile = profileMap.get(prev.remote_jid)
      const directPushName = profile ? (profile.push_name ?? prev.push_name ?? null) : (prev.push_name ?? null)
      const directProfilePicture = profile ? (profile.profile_picture_url ?? prev.profile_picture_url ?? null) : (prev.profile_picture_url ?? null)

      let nextPushName = directPushName
      if (prev.remote_jid.endsWith('@lid') && isFallbackDisplayName(nextPushName, prev.remote_jid)) {
        const companionName = profiles.find(candidate =>
          candidate.remote_jid !== prev.remote_jid
          && remoteJidLocalPart(candidate.remote_jid) === remoteJidLocalPart(prev.remote_jid)
          && !isFallbackDisplayName(candidate.push_name, candidate.remote_jid)
        )?.push_name

        if (companionName) {
          nextPushName = companionName
        }
      }

      if (nextPushName === prev.push_name && directProfilePicture === prev.profile_picture_url) {
        return prev
      }

      return {
        ...prev,
        push_name: nextPushName,
        profile_picture_url: directProfilePicture,
      }
    })
  }, [])

  // Sync de histórico — importa mensagens da Evolution para o banco
  const syncHistory = useCallback(async (instance: WaInstance, silent = false) => {
    if (!silent) { setSyncing(true); setSyncStatus('Importando histórico...') }
    let page = 1
    let totalPages = 1
    let totalImported = 0
    do {
      const res = await efCall('whatsapp-sync', { instance_name: instance.instance_name, page, limit: 100 })
      if (res.error) break
      totalImported += (res.imported as number) || 0
      totalPages = (res.totalPages as number) || 1
      page++
      if (page > 5) break // máximo 500 mensagens por sync manual (5 páginas)
    } while (page <= totalPages)
    if (!silent) {
      setSyncStatus(`${totalImported} mensagens importadas`)
      setTimeout(() => { setSyncing(false); setSyncStatus('') }, 2000)
    }
  }, [])

  useEffect(() => {
    if (activeInstance) {
      profileSyncSignatureRef.current = ''
      loadConversations(activeInstance)
      syncHistory(activeInstance, true).then(() => loadConversations(activeInstance, { preserveSelected: true }))
    }
  }, [activeInstance, loadConversations, syncHistory])

  useEffect(() => {
    if (!activeInstance || conversations.length === 0) return
    const jids = conversations
      .filter(conv => conv.instance_name === activeInstance.instance_name)
      .filter(conv =>
        conv.chat_type === 'group'
          ? !conv.profile_picture_url || isFallbackDisplayName(conv.push_name, conv.remote_jid)
          : !conv.profile_picture_url || (conv.remote_jid.endsWith('@lid') && isFallbackDisplayName(conv.push_name, conv.remote_jid))
      )
      .slice(0, 30)
      .map(conv => conv.remote_jid)

    if (jids.length === 0) return

    const signature = `${activeInstance.instance_name}::${jids.join('|')}`
    if (profileSyncSignatureRef.current === signature) return
    profileSyncSignatureRef.current = signature

    void loadConversationProfiles(activeInstance.instance_name, jids)
  }, [activeInstance, conversations, loadConversationProfiles])

  const loadMessages = useCallback(async (conv: Conversation, options?: { silent?: boolean }) => {
    const silent = options?.silent === true
    const requestKey = conversationKey(conv)
    messagesRequestKeyRef.current = requestKey
    if (!silent) {
      setLoadingMsgs(true)
      setMessages([])
    }
    const { data } = await supabase
      .from('chat_messages')
      .select('id, evolution_message_id, body, from_me, message_type, ai_suggestion, message_timestamp, created_at, metadata')
      .is('cliente_id', null)
      .eq('instance_name', conv.instance_name)
      .eq('canonical_remote_jid', conv.remote_jid)
      .order('created_at', { ascending: true })
      .limit(200)
    if (messagesRequestKeyRef.current !== requestKey) return
    if (data) {
      const next = mergePendingMessages(conv, sortMessages(data as Message[]))
      setMessages(prev => {
        if (
          prev.length === next.length &&
          prev.every((msg, index) => msg.id === next[index].id)
        ) {
          return prev
        }
        return next
      })
    }
    if (!silent) setLoadingMsgs(false)
  }, [mergePendingMessages])

  const loadConversationSettings = useCallback(async (conv: Conversation) => {
    const requestKey = conversationKey(conv)
    settingsRequestKeyRef.current = requestKey
    setLoadingSuggestions(true)
    const res = await efCall('whatsapp-conversation-settings', {
      instance_name: conv.instance_name,
      canonical_remote_jid: conv.remote_jid,
    })
    if (settingsRequestKeyRef.current !== requestKey) return
    setSuggestionsEnabled((res.suggestions_enabled as boolean | undefined) ?? true)
    setLoadingSuggestions(false)
  }, [])

  const markConversationRead = useCallback(async (conv: Conversation) => {
    const readAt = new Date().toISOString()
    setConversations(prev => prev.map(item =>
      item.instance_name === conv.instance_name && item.remote_jid === conv.remote_jid
        ? { ...item, unread: 0 }
        : item
    ))
    await efCall('whatsapp-conversation-settings', {
      instance_name: conv.instance_name,
      canonical_remote_jid: conv.remote_jid,
      last_read_at: readAt,
    })
  }, [])

  function selectConv(conv: Conversation) {
    const nextSelected = { ...conv, unread: 0 }
    setSelected(nextSelected)
    setInputValue('')
    setAppliedSuggestion(null)
    loadMessages(nextSelected)
    loadConversationSettings(nextSelected)
    void loadConversationProfiles(nextSelected.instance_name, [nextSelected.remote_jid])
    void markConversationRead(nextSelected)
  }

  const toggleSuggestions = useCallback(async () => {
    if (!selected || savingSuggestions || loadingSuggestions) return
    const nextValue = !suggestionsEnabled
    setSavingSuggestions(true)
    setSuggestionsEnabled(nextValue)

    const res = await efCall('whatsapp-conversation-settings', {
      instance_name: selected.instance_name,
      canonical_remote_jid: selected.remote_jid,
      suggestions_enabled: nextValue,
    })

    setSavingSuggestions(false)
    if (res.error) {
      setSuggestionsEnabled(!nextValue)
      setSendError(res.error as string)
    }
  }, [selected, savingSuggestions, loadingSuggestions, suggestionsEnabled])

  const sendMessage = useCallback(async () => {
    if (!selected || !inputValue.trim()) return
    setSendingCount(count => count + 1)
    setSendError('')
    const text = inputValue.trim()
    setInputValue('')
    setAppliedSuggestion(null)

    // Adiciona mensagem otimisticamente — aparece imediatamente na UI
    const clientMessageId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const optimisticId = `optimistic_${clientMessageId}`
    const now = new Date().toISOString()
    const optimisticMsg: Message = {
      id: optimisticId,
      evolution_message_id: null,
      body: text,
      from_me: true,
      message_type: 'conversation',
      ai_suggestion: null,
      message_timestamp: now,
      created_at: now,
      metadata: { client_message_id: clientMessageId, pending: true, confirmed: false },
    }
    const pendingKey = conversationKey(selected)
    const prevPending = pendingMessagesRef.current[pendingKey] || []
    pendingMessagesRef.current[pendingKey] = sortMessages([...prevPending, optimisticMsg])
    setMessages(prev => sortMessages([...prev, optimisticMsg]))
    setConversations(prev => sortConversations(prev.map(c =>
      c.instance_name === selected.instance_name && c.remote_jid === selected.remote_jid
        ? { ...c, last_body: text, last_ts: now, from_me_last: true }
        : c
    )))

    const res = await efCall('whatsapp-send', {
      instance_name: selected.instance_name,
      remote_jid: selected.remote_jid,
      text,
      client_message_id: clientMessageId,
      client_timestamp: now,
    })

    setSendingCount(count => Math.max(0, count - 1))
    if (res.error) {
      // Remove mensagem otimista se falhou
      pendingMessagesRef.current[pendingKey] = (pendingMessagesRef.current[pendingKey] || []).filter(
        msg => msg.metadata?.client_message_id !== clientMessageId
      )
      setMessages(prev => prev.filter(m => m.id !== optimisticId))
      setSendError(res.error as string)
      return
    }

    if (res.persisted === false) {
      setSendError('Mensagem enviada, mas ainda nao confirmada no CRM. Ela sera mantida localmente ate sincronizar.')
      return
    }

    const confirmedMessageId = (res.message_id as string | undefined) || null
    pendingMessagesRef.current[pendingKey] = (pendingMessagesRef.current[pendingKey] || []).filter(
      msg => msg.metadata?.client_message_id !== clientMessageId
    )
    setMessages(prev => prev.map(msg =>
      msg.metadata?.client_message_id === clientMessageId
        ? {
            ...msg,
            evolution_message_id: confirmedMessageId,
            metadata: {
              ...msg.metadata,
              pending: false,
              confirmed: true,
            },
          }
        : msg
    ))
  }, [selected, inputValue, loadMessages])

  function handleConnected(inst: WaInstance) {
    setShowConnect(false)
    setInstances(prev => {
      const exists = prev.find(i => i.instance_name === inst.instance_name)
      const updated = exists ? prev.map(i => i.instance_name === inst.instance_name ? { ...i, status: 'connected' } : i) : [...prev, inst]
      return updated
    })
    setActiveInstance(inst)
  }

  const lastSuggestion = [...messages].reverse().find(m => !m.from_me && m.ai_suggestion)?.ai_suggestion ?? null
  const filtered = conversations.filter(c => {
    const matchesSearch = !search || displayName(c).toLowerCase().includes(search.toLowerCase())
    const matchesFilter = chatFilter === 'all' || c.chat_type === chatFilter
    return matchesSearch && matchesFilter
  })

  return (
    <div className={styles.layout}>
      <Sidebar sectorNav={comercialNav} sectorNavTitle="COMERCIAL" />

      <div className={styles.chatApp}>
        {/* ── Lista de conversas ── */}
        <div className={styles.convList}>
          <div className={styles.convListHeader}>
            <div className={styles.convListTitleRow}>
              <h2 className={styles.convListTitle}>💬 Chat</h2>
              <div style={{ display: 'flex', gap: 6 }}>
                {activeInstance && (
                  <button
                    className={styles.syncBtn}
                    onClick={() => syncHistory(activeInstance).then(() => loadConversations(activeInstance, { preserveSelected: true }))}
                    disabled={syncing}
                    title="Importar histórico"
                  >
                    {syncing ? syncStatus || '⏳' : '↻'}
                  </button>
                )}
                <button className={styles.connectBtn} onClick={() => setShowConnect(true)} title="Conectar novo número">
                  + Conectar
                </button>
              </div>
            </div>

            {/* Abas de instância */}
            {!loadingInstances && instances.length > 1 && (
              <div className={styles.instanceTabs}>
                {instances.map(inst => (
                  <button
                    key={inst.id}
                    className={`${styles.instanceTab} ${activeInstance?.instance_name === inst.instance_name ? styles.instanceTabActive : ''}`}
                    onClick={() => setActiveInstance(inst)}
                  >
                    {inst.display_name || inst.instance_name}
                  </button>
                ))}
              </div>
            )}

            {!loadingInstances && instances.length === 1 && activeInstance && (
              <div className={styles.instanceSingle}>
                <span className={styles.instanceDot} />
                {activeInstance.display_name || activeInstance.instance_name}
              </div>
            )}

            <input
              className={styles.convSearch}
              placeholder="Buscar conversa..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />

            <div className={styles.chatFilters} role="tablist" aria-label="Filtro de conversas">
              <button
                type="button"
                className={`${styles.chatFilterBtn} ${chatFilter === 'all' ? styles.chatFilterBtnActive : ''}`}
                onClick={() => setChatFilter('all')}
              >
                Todos
              </button>
              <button
                type="button"
                className={`${styles.chatFilterBtn} ${chatFilter === 'direct' ? styles.chatFilterBtnActive : ''}`}
                onClick={() => setChatFilter('direct')}
              >
                Conversas
              </button>
              <button
                type="button"
                className={`${styles.chatFilterBtn} ${chatFilter === 'group' ? styles.chatFilterBtnActive : ''}`}
                onClick={() => setChatFilter('group')}
              >
                Grupos
              </button>
            </div>
          </div>

          <div className={styles.convItems}>
            {loadingInstances || loadingConvs ? (
              <div className={styles.convLoading}>Carregando...</div>
            ) : instances.length === 0 ? (
              <div className={styles.convEmpty}>
                <p>Nenhum número conectado.</p>
                <p>Clique em <strong>+ Conectar</strong> para vincular seu WhatsApp.</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className={styles.convEmpty}>
                <p>Nenhuma conversa ainda.</p>
              </div>
            ) : (
              filtered.map(conv => (
                <button
                  key={`${conv.instance_name}::${conv.remote_jid}`}
                  className={`${styles.convItem} ${selected?.instance_name === conv.instance_name && selected?.remote_jid === conv.remote_jid ? styles.convItemActive : ''} ${conv.unread > 0 ? styles.convItemUnread : ''}`}
                  onClick={() => selectConv(conv)}
                >
                  <ConversationAvatar conv={conv} className={styles.convAvatar} />
                  <div className={styles.convInfo}>
                    <div className={styles.convTopRow}>
                      <div className={styles.convName}>{displayName(conv)}</div>
                      {conv.chat_type === 'group' && <span className={styles.convTypeBadge}>Grupo</span>}
                    </div>
                    <div className={styles.convPreview}>
                      {conv.from_me_last && <span className={styles.convFromMe}>Você: </span>}
                      {conv.last_body || '(mídia)'}
                    </div>
                  </div>
                  <div className={styles.convMeta}>
                    <span className={styles.convTime}>{fmtTime(conv.last_ts)}</span>
                    {conv.unread > 0 && <span className={styles.convUnreadBadge}>{conv.unread}</span>}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── Painel de mensagens ── */}
        <div className={styles.msgPane}>
          {!selected ? (
            <div className={styles.msgEmpty}>
              <div className={styles.msgEmptyIcon}>💬</div>
              <p>Selecione uma conversa para começar</p>
            </div>
          ) : (
            <>
              <div className={styles.msgHeader}>
                <div className={styles.msgHeaderIdentity}>
                  <ConversationAvatar conv={selected} className={styles.msgHeaderAvatar} />
                  <div className={styles.msgHeaderInfo}>
                    <div className={styles.msgHeaderTitleRow}>
                      <div className={styles.msgHeaderName}>{displayName(selected)}</div>
                    </div>
                    <div className={styles.msgHeaderPhone}>
                      {selected.chat_type === 'group'
                        ? 'Grupo do WhatsApp'
                        : selected.phone_normalized || selected.remote_jid.replace(/@.*$/, '')}
                    </div>
                  </div>
                </div>
                <div
                  className={`${styles.suggestionToggleWrap} ${
                    loadingSuggestions
                      ? styles.suggestionToggleWrapLoading
                      : suggestionsEnabled
                        ? styles.suggestionToggleWrapActive
                        : styles.suggestionToggleWrapInactive
                  }`}
                >
                  <span className={`${styles.suggestionToggleLabel} ${styles.suggestionToggleLabelLeft}`}>
                    {loadingSuggestions ? '' : suggestionsEnabled ? '' : 'Nao sugerir respostas'}
                  </span>
                  <button
                    className={`${styles.suggestionToggle} ${
                      loadingSuggestions
                        ? styles.suggestionToggleLoading
                        : suggestionsEnabled
                          ? styles.suggestionToggleActive
                          : styles.suggestionToggleInactive
                    }`}
                    type="button"
                    onClick={toggleSuggestions}
                    disabled={savingSuggestions || loadingSuggestions}
                    aria-pressed={suggestionsEnabled}
                    title={
                      loadingSuggestions
                        ? 'Carregando configuracao de IA desta conversa'
                        : suggestionsEnabled
                          ? 'Desativar sugestoes de IA para esta conversa'
                          : 'Ativar sugestoes de IA para esta conversa'
                    }
                  >
                    <span className={styles.suggestionToggleTrack}>
                      <span className={styles.suggestionToggleThumb}>
                        <span className={styles.suggestionToggleThumbText}>IA</span>
                      </span>
                    </span>
                  </button>
                  <span className={`${styles.suggestionToggleLabel} ${styles.suggestionToggleLabelRight}`}>
                    {loadingSuggestions
                      ? 'Carregando IA'
                      : suggestionsEnabled
                        ? 'Sugerir respostas'
                        : ''}
                  </span>
                </div>
                <div className={styles.msgHeaderSpacer} aria-hidden="true" />
              </div>

              <div className={styles.msgFeed} ref={feedRef}>
                {loadingMsgs ? (
                  <div className={styles.msgLoading}>Carregando mensagens...</div>
                ) : messages.length === 0 ? (
                  <div className={styles.msgFeedEmpty}>Nenhuma mensagem ainda</div>
                ) : (
                  messages.map(msg => (
                    <div
                      key={msg.id}
                      className={`${styles.bubbleWrap} ${msg.from_me ? styles.bubbleWrapOut : styles.bubbleWrapIn}`}
                    >
                      <div className={`${styles.bubble} ${msg.from_me ? styles.bubbleOut : styles.bubbleIn}`}>
                        {msg.message_type === 'audio' ? '🎵 Áudio'
                          : msg.message_type === 'image' ? `📷 ${msg.body || 'Imagem'}`
                          : msg.message_type === 'document' ? `📄 ${msg.body}`
                          : msg.message_type === 'sticker' ? '🎭 Sticker'
                          : msg.body}
                        <span className={styles.bubbleMetaRow}>
                          {msg.metadata?.pending && (
                            <span className={styles.bubblePending}>
                              <span className={styles.bubblePendingDot} />
                              Enviando
                            </span>
                          )}
                          {!msg.metadata?.pending && msg.from_me && msg.metadata?.confirmed && (
                            <span className={styles.bubbleConfirmed}>v</span>
                          )}
                          <span className={styles.bubbleTime}>{fmtFull(msg.message_timestamp || msg.created_at)}</span>
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {suggestionsEnabled && lastSuggestion && (
                <div className={styles.aiCard}>
                  <div className={styles.aiCardHeader}>
                    <span className={styles.aiCardTitle}>🤖 Sugestão da IA</span>
                    <span className={styles.aiCardBadge}>SPIN · AIDA</span>
                  </div>
                  <p className={styles.aiCardText}>{lastSuggestion}</p>
                  <button
                    className={styles.aiApplyBtn}
                    onClick={() => { setInputValue(lastSuggestion); setAppliedSuggestion(lastSuggestion) }}
                  >
                    ✏️ Aplicar
                  </button>
                </div>
              )}

              <div className={styles.inputWrap}>
                <textarea
                  className={styles.inputArea}
                  placeholder="Digite sua mensagem... (Enter para enviar, Shift+Enter para nova linha)"
                  value={inputValue}
                  rows={2}
                  onChange={e => { setInputValue(e.target.value); setAppliedSuggestion(null); setSendError('') }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
                  }}
                />
                <button
                  className={styles.sendBtn}
                  title="Enviar"
                  disabled={!inputValue.trim()}
                  onClick={sendMessage}
                >
                  ➤
                </button>
              </div>
              {sendingCount > 0 && (
                <p className={styles.sendQueueHint}>
                  {sendingCount === 1 ? '1 mensagem em envio' : `${sendingCount} mensagens em envio`}
                </p>
              )}
              {sendError && <p className={styles.sendError}>{sendError}</p>}
              {appliedSuggestion && inputValue === appliedSuggestion && (
                <p className={styles.appliedHint}>Sugestão aplicada — pressione Enter para enviar</p>
              )}
            </>
          )}
        </div>
      </div>

      {showConnect && (
        <ConnectModal onClose={() => setShowConnect(false)} onConnected={handleConnected} />
      )}
    </div>
  )
}
