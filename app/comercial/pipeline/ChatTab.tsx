'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createChatSupabaseClient } from '@/lib/chat-supabase'
import styles from './pipeline.module.css'

interface ChatMessage {
  id: string
  body: string | null
  from_me: boolean
  message_type: string
  ai_suggestion: string | null
  message_timestamp: string | null
  created_at: string
  metadata: { pushName?: string | null }
  phone_normalized: string | null
  remote_jid: string
}

interface Props {
  leadId: string
  leadPhone?: string | null
  companyName: string
}

function getMessageSortTime(message: Pick<ChatMessage, 'message_timestamp' | 'created_at'>) {
  return new Date(message.message_timestamp || message.created_at).getTime()
}

function sortMessages<T extends Pick<ChatMessage, 'message_timestamp' | 'created_at'>>(list: T[]) {
  return [...list].sort((a, b) => getMessageSortTime(a) - getMessageSortTime(b))
}

export default function ChatTab({ leadId, leadPhone, companyName }: Props) {
  const supabase = useRef(createChatSupabaseClient()).current
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading]   = useState(true)
  const [appliedSuggestion, setAppliedSuggestion] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const phoneNormalized = leadPhone ? leadPhone.replace(/[^0-9]/g, '') : null

  const loadMessages = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true
    if (!leadId) return
    if (!silent) setLoading(true)
    const { data } = await supabase
      .from('chat_messages')
      .select('id, body, from_me, message_type, ai_suggestion, message_timestamp, created_at, metadata, phone_normalized, remote_jid')
      .eq('lead_id', leadId)
      .is('cliente_id', null)
      .order('created_at', { ascending: true })
      .limit(100)
    if (data) {
      const next = sortMessages(data as ChatMessage[])
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
    if (!silent) setLoading(false)
  }, [leadId])

  // Scroll automático para última mensagem
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  // Carrega apenas ao abrir o chat do lead
  useEffect(() => {
    loadMessages()
  }, [leadId, loadMessages])

  const fmtTime = (iso: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  const applysuggestion = (suggestion: string) => {
    setInputValue(suggestion)
    setAppliedSuggestion(suggestion)
  }

  // Última sugestão de IA disponível (mensagem recebida)
  const lastSuggestion = [...messages]
    .reverse()
    .find(m => !m.from_me && m.ai_suggestion)?.ai_suggestion ?? null

  if (loading) {
    return (
      <div className={styles.chatLoading}>
        <div className={styles.aiLoadingSpinner} />
        <span>Carregando mensagens...</span>
      </div>
    )
  }

  return (
    <div className={styles.chatTabWrap}>
      {/* Feed de mensagens */}
      <div className={styles.chatFeed} ref={listRef}>
        {messages.length === 0 ? (
          <div className={styles.chatEmpty}>
            <div className={styles.chatEmptyIcon}>💬</div>
            <p>Nenhuma mensagem ainda.</p>
            <p className={styles.chatEmptyHint}>
              Configure o webhook na Evolution API para espelhar o WhatsApp aqui.
            </p>
            {phoneNormalized && (
              <p className={styles.chatEmptyHint}>
                Aguardando mensagens do número <strong>{leadPhone}</strong>
              </p>
            )}
          </div>
        ) : (
          messages.map(msg => (
            <div
              key={msg.id}
              className={`${styles.chatBubbleWrap} ${msg.from_me ? styles.chatBubbleWrapOut : styles.chatBubbleWrapIn}`}
            >
              {!msg.from_me && msg.metadata?.pushName && (
                <span className={styles.chatPushName}>{msg.metadata.pushName}</span>
              )}
              <div className={`${styles.chatBubble} ${msg.from_me ? styles.chatBubbleOut : styles.chatBubbleIn}`}>
                {msg.message_type === 'audio' ? (
                  <span className={styles.chatMediaLabel}>🎵 Áudio</span>
                ) : msg.message_type === 'image' ? (
                  <span className={styles.chatMediaLabel}>📷 {msg.body || 'Imagem'}</span>
                ) : msg.message_type === 'document' ? (
                  <span className={styles.chatMediaLabel}>📄 {msg.body}</span>
                ) : msg.message_type === 'sticker' ? (
                  <span className={styles.chatMediaLabel}>🎭 Sticker</span>
                ) : (
                  <span>{msg.body}</span>
                )}
                <span className={styles.chatBubbleTime}>{fmtTime(msg.message_timestamp || msg.created_at)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Card de Sugestão da IA */}
      {lastSuggestion && (
        <div className={styles.chatAiCard}>
          <div className={styles.chatAiCardHeader}>
            <span className={styles.chatAiCardTitle}>🤖 Sugestão da IA</span>
            <span className={styles.chatAiCardBadge}>SPIN · AIDA</span>
          </div>
          <p className={styles.chatAiCardText}>{lastSuggestion}</p>
          <button
            className={styles.chatAiApplyBtn}
            onClick={() => applysuggestion(lastSuggestion)}
          >
            ✏️ Aplicar no input
          </button>
        </div>
      )}

      {/* Input de texto (referência — envio via WhatsApp externo) */}
      <div className={styles.chatInputWrap}>
        <textarea
          className={styles.chatInputArea}
          placeholder="Rascunhe sua resposta aqui... (envie pelo WhatsApp)"
          value={inputValue}
          onChange={e => { setInputValue(e.target.value); setAppliedSuggestion(null) }}
          rows={2}
        />
        <button
          className={styles.chatCopyBtn}
          title="Copiar texto"
          onClick={() => { navigator.clipboard.writeText(inputValue) }}
          disabled={!inputValue.trim()}
        >
          📋
        </button>
      </div>
      {appliedSuggestion && inputValue === appliedSuggestion && (
        <p className={styles.chatAppliedHint}>Sugestão aplicada — copie e envie pelo WhatsApp</p>
      )}
    </div>
  )
}
