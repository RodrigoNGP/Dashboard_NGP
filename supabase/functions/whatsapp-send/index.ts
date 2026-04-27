// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function logSystemEvent(
  sb: ReturnType<typeof createClient>,
  entry: {
    event: string
    errorMessage: string
    payload?: Record<string, unknown>
    instanceName?: string | null
    evolutionMessageId?: string | null
    severity?: string
  }
) {
  try {
    await sb.from('system_logs').insert({
      scope: 'whatsapp-chat',
      source: 'whatsapp-send',
      event: entry.event,
      severity: entry.severity || 'error',
      instance_name: entry.instanceName || null,
      evolution_message_id: entry.evolutionMessageId || null,
      error_message: entry.errorMessage,
      payload: entry.payload || {},
    })
  } catch (logError) {
    console.error('[whatsapp-send] Falha ao salvar system_logs:', logError)
  }
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
    console.error('[whatsapp-send] Falha ao projetar conversa:', error)
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
      console.error('[whatsapp-send] Falha ao buscar lead por telefone:', error)
      return null
    }

    const lead = Array.isArray(data) ? data[0] : null
    if (!lead?.id) return null

    return {
      id: lead.id as string,
    }
  } catch (error) {
    console.error('[whatsapp-send] Erro inesperado ao buscar lead por telefone:', error)
    return null
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { session_token, instance_name, remote_jid, text, client_message_id, client_timestamp } = await req.json()

    if (!session_token) return json({ error: 'Sessão inválida.' }, 401)
    if (!instance_name || !remote_jid || !text?.trim()) {
      return json({ error: 'Parâmetros obrigatórios: instance_name, remote_jid, text.' }, 400)
    }

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
    if (!sessao?.usuario_id) return json({ error: 'Sessão expirada.' }, 401)

    const { data: inst } = await sb
      .from('whatsapp_instances')
      .select('id')
      .eq('instance_name', instance_name)
      .eq('usuario_id', sessao.usuario_id)
      .single()
    if (!inst) {
      return json({ error: 'Instância não encontrada para este usuário.' }, 404)
    }

    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL')
    const evolutionKey = Deno.env.get('EVOLUTION_GLOBAL_KEY')
    if (!evolutionUrl || !evolutionKey) {
      return json({ error: 'Evolution API não configurada.' }, 500)
    }

    // Para JIDs @lid, passa o JID completo; para @s.whatsapp.net, passa só o número
    const number = remote_jid.endsWith('@lid') || remote_jid.endsWith('@g.us')
      ? remote_jid
      : remote_jid.replace(/@.*$/, '')

    const res = await fetch(`${evolutionUrl}/message/sendText/${instance_name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionKey,
      },
      body: JSON.stringify({
        number,
        text: text.trim(),
      }),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error('[whatsapp-send] Evolution error', res.status, JSON.stringify(data))
      return json({ error: data?.message || data?.error || `Erro ${res.status} na Evolution API.` }, 502)
    }

    const messageId = data?.key?.id || crypto.randomUUID()
    const isGroup = isGroupJid(remote_jid)
    const phoneNormalized = resolvePhoneNormalized(remote_jid)
    const canonicalRemoteJid = canonicalizeRemoteJid(remote_jid, phoneNormalized)
    const messageTimestamp = new Date().toISOString()

    let leadId: string | null = null
    if (!isGroup && phoneNormalized) {
      const match = await findLeadByPhone(sb, phoneNormalized)
      if (match) leadId = match.id
    }

    const { error: persistError } = await sb.from('chat_messages').upsert(
      {
        instance_name,
        evolution_message_id: messageId,
        remote_jid,
        canonical_remote_jid: canonicalRemoteJid,
        phone_normalized: phoneNormalized || null,
        from_me: true,
        lead_id: leadId,
        cliente_id: null,
        body: text.trim(),
        message_type: 'conversation',
        ai_suggestion: null,
        chat_type: isGroup ? 'group' : 'direct',
        message_timestamp: messageTimestamp,
        metadata: {
          pushName: null,
          source: 'whatsapp-send',
          client_message_id: client_message_id || null,
          client_timestamp: client_timestamp || null,
        },
      },
      { onConflict: 'instance_name,evolution_message_id', ignoreDuplicates: true }
    )

    if (persistError) {
      await logSystemEvent(sb, {
        event: 'send_persist_failed',
        errorMessage: persistError.message,
        instanceName: instance_name,
        evolutionMessageId: messageId,
        payload: {
          remote_jid,
          client_message_id: client_message_id || null,
          client_timestamp: client_timestamp || null,
        },
      })
      return json({ ok: true, message_id: messageId, persisted: false })
    }

    await upsertConversationProjection(sb, {
      instanceName: instance_name,
      remoteJid: remote_jid,
      canonicalRemoteJid,
      phoneNormalized: phoneNormalized || null,
      chatType: isGroup ? 'group' : 'direct',
      leadId,
      displayName: null,
      lastMessagePreview: text.trim(),
      lastMessageAt: messageTimestamp,
      lastMessageFromMe: true,
    })

    return json({ ok: true, message_id: messageId, persisted: true })
  } catch (e) {
    console.error('[whatsapp-send]', e)
    return json({ error: 'Erro interno.' }, 500)
  }
})
