// @ts-nocheck
// Importa histórico de mensagens de uma instância da Evolution API para o banco
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizePhone(jid: string): string {
  return jid.replace(/@.*$/, '').replace(/[^0-9]/g, '')
}

function isGroupJid(jid: string): boolean {
  return jid.includes('@g.us')
}

function isLidJid(jid: string): boolean {
  return jid.endsWith('@lid')
}

function resolvePhoneNormalized(remoteJid: string): string {
  if (isGroupJid(remoteJid) || isLidJid(remoteJid)) return ''
  return normalizePhone(remoteJid)
}

function canonicalizeRemoteJid(remoteJid: string, phoneNormalized?: string | null): string {
  if (isGroupJid(remoteJid) || isLidJid(remoteJid)) return remoteJid
  const normalized = (phoneNormalized || normalizePhone(remoteJid)).trim()
  if (normalized) return `${normalized}@s.whatsapp.net`
  return remoteJid
}

function extractBody(message: any): { body: string; type: string } {
  if (message?.conversation) return { body: message.conversation, type: 'conversation' }
  if (message?.extendedTextMessage?.text) return { body: message.extendedTextMessage.text, type: 'extendedText' }
  if (message?.imageMessage?.caption) return { body: message.imageMessage.caption, type: 'image' }
  if (message?.videoMessage?.caption) return { body: message.videoMessage.caption, type: 'video' }
  if (message?.audioMessage) return { body: '[Audio]', type: 'audio' }
  if (message?.documentMessage) return { body: `[Documento: ${message.documentMessage.fileName || ''}]`, type: 'document' }
  if (message?.stickerMessage) return { body: '[Sticker]', type: 'sticker' }
  return { body: '', type: 'unknown' }
}

async function upsertConversationProjection(
  sb: ReturnType<typeof createClient>,
  entry: {
    instanceName: string
    remoteJid: string
    canonicalRemoteJid: string
    phoneNormalized?: string | null
    chatType: 'direct' | 'group'
    leadId?: string | null
    displayName?: string | null
    lastMessagePreview?: string | null
    lastMessageAt?: string | null
    lastMessageFromMe: boolean
  }
) {
  try {
    await sb.rpc('upsert_chat_conversation_projection', {
      p_instance_name: entry.instanceName,
      p_remote_jid: entry.remoteJid,
      p_canonical_remote_jid: entry.canonicalRemoteJid,
      p_phone_normalized: entry.phoneNormalized || null,
      p_chat_type: entry.chatType,
      p_lead_id: entry.leadId || null,
      p_display_name: entry.displayName || null,
      p_profile_picture_url: null,
      p_last_message_preview: entry.lastMessagePreview || null,
      p_last_message_at: entry.lastMessageAt || null,
      p_last_message_from_me: entry.lastMessageFromMe,
    })
  } catch (error) {
    console.error('[whatsapp-sync] Falha ao projetar conversa:', error)
  }
}

async function findLeadByPhone(
  sb: ReturnType<typeof createClient>,
  phoneNormalized: string
) {
  if (!phoneNormalized) return null

  try {
    const { data, error } = await sb.rpc('find_crm_lead_by_phone', {
      p_phone: phoneNormalized,
    })

    if (error) {
      console.error('[whatsapp-sync] Falha ao buscar lead por telefone:', error)
      return null
    }

    const lead = Array.isArray(data) ? data[0] : null
    if (!lead?.id) return null

    return {
      id: lead.id as string,
    }
  } catch (error) {
    console.error('[whatsapp-sync] Erro inesperado ao buscar lead por telefone:', error)
    return null
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { session_token, instance_name, page = 1, limit = 100 } = await req.json()

    if (!session_token) return json({ error: 'Sessao invalida.' }, 401)

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: sessao } = await sb
      .from('sessions')
      .select('usuario_id')
      .eq('token', session_token)
      .gt('expires_at', new Date().toISOString())
      .single()
    if (!sessao?.usuario_id) return json({ error: 'Sessao expirada.' }, 401)

    // Verifica que a instância pertence ao usuário
    const { data: inst } = await sb
      .from('whatsapp_instances')
      .select('id')
      .eq('instance_name', instance_name)
      .eq('usuario_id', sessao.usuario_id)
      .single()
    if (!inst) return json({ error: 'Instancia nao encontrada.' }, 404)

    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL')
    const evolutionKey = Deno.env.get('EVOLUTION_GLOBAL_KEY')
    if (!evolutionUrl || !evolutionKey) return json({ error: 'Evolution API nao configurada.' }, 500)

    // Busca mensagens da página solicitada
    const res = await fetch(`${evolutionUrl}/chat/findMessages/${instance_name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': evolutionKey },
      body: JSON.stringify({ where: {}, limit, page }),
    })

    if (!res.ok) return json({ error: `Erro ${res.status} ao buscar mensagens.` }, 502)

    const data = await res.json()
    const records = data?.messages?.records || []
    const totalPages = data?.messages?.pages || 1

    let imported = 0
    for (const msg of records) {
      try {
        const key = msg?.key || {}
        const evolutionMessageId: string = key?.id
        if (!evolutionMessageId) continue

        // Prefere remoteJidAlt (telefone real) sobre remoteJid (@lid)
        // MAS mantém remoteJid se for um grupo (@g.us)
        const remoteJid: string = isGroupJid(key?.remoteJid || '')
          ? (key.remoteJid || '')
          : (key?.remoteJidAlt || key?.remoteJid || '')
        if (!remoteJid) continue

        const fromMe: boolean = key?.fromMe === true
        const isGroup = isGroupJid(remoteJid)
        const phoneNormalized = resolvePhoneNormalized(remoteJid)
        const canonicalRemoteJid = canonicalizeRemoteJid(remoteJid, phoneNormalized)
        const { body, type: messageType } = extractBody(msg?.message || {})
        const messageTimestamp = msg?.messageTimestamp
          ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
          : null

        // Vincula lead pelo telefone
        let leadId: string | null = null
        if (!isGroup && phoneNormalized) {
          const match = await findLeadByPhone(sb, phoneNormalized)
          if (match) leadId = match.id
        }

        await sb.from('chat_messages').upsert(
          {
            instance_name,
            evolution_message_id: evolutionMessageId,
            remote_jid: remoteJid,
            canonical_remote_jid: canonicalRemoteJid,
            phone_normalized: phoneNormalized || null,
            from_me: fromMe,
            lead_id: leadId,
            cliente_id: null,
            body: body || null,
            message_type: messageType,
            ai_suggestion: null,
            chat_type: isGroup ? 'group' : 'direct',
            message_timestamp: messageTimestamp,
            metadata: {
              pushName: msg?.pushName || null,
              source: msg?.source || null,
            },
          },
          { onConflict: 'instance_name,evolution_message_id', ignoreDuplicates: true }
        )

        await upsertConversationProjection(sb, {
          instanceName: instance_name,
          remoteJid: remoteJid,
          canonicalRemoteJid,
          phoneNormalized: phoneNormalized || null,
          chatType: isGroup ? 'group' : 'direct',
          leadId,
          displayName: null,
          lastMessagePreview: body || null,
          lastMessageAt: messageTimestamp,
          lastMessageFromMe: fromMe,
        })
        imported++
      } catch (err) {
        console.error('[whatsapp-sync] erro msg:', err)
      }
    }

    return json({ ok: true, imported, page, totalPages })
  } catch (e) {
    console.error('[whatsapp-sync]', e)
    return json({ error: 'Erro interno.' }, 500)
  }
})
