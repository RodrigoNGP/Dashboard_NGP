// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizeRemoteTarget(remoteJid: string): string {
  return remoteJid.endsWith('@lid')
    ? remoteJid
    : remoteJid.replace(/@.*$/, '')
}

function remoteJidLocalPart(remoteJid: string) {
  return remoteJid.replace(/@.*$/, '').trim()
}

function canonicalizeRemoteJid(remoteJid: string): string {
  if (remoteJid.includes('@g.us') || remoteJid.endsWith('@lid')) return remoteJid
  const normalized = remoteJid.replace(/@.*$/, '').replace(/[^0-9]/g, '')
  if (normalized) return `${normalized}@s.whatsapp.net`
  return remoteJid
}

function isGroupJid(remoteJid: string) {
  return remoteJid.includes('@g.us')
}

function hasMeaningfulPushName(
  pushName: string | null | undefined,
  remoteJid: string,
  instanceDisplayName?: string | null
) {
  const trimmed = pushName?.trim()
  if (!trimmed) return false
  if (trimmed === remoteJidLocalPart(remoteJid)) return false
  if (instanceDisplayName && trimmed === instanceDisplayName) return false
  return true
}

function shouldSkipRefresh(
  current: { push_name?: string | null; profile_picture_url?: string | null; last_synced_at?: string | null } | undefined,
  remoteJid: string,
  instanceDisplayName?: string | null
) {
  if (!current || !isFresh(current.last_synced_at)) return false

  if (isGroupJid(remoteJid)) {
    return hasMeaningfulPushName(current.push_name, remoteJid, instanceDisplayName)
  }

  if (remoteJid.endsWith('@lid')) {
    return Boolean(
      hasMeaningfulPushName(current.push_name, remoteJid, instanceDisplayName)
      || (current.profile_picture_url && current.profile_picture_url.trim())
    )
  }

  return Boolean(
    hasMeaningfulPushName(current.push_name, remoteJid, instanceDisplayName)
    || (current.profile_picture_url && current.profile_picture_url.trim())
  )
}

async function fetchGroupInfo(
  evolutionUrl: string,
  evolutionKey: string,
  instanceName: string,
  remoteJid: string
) {
  try {
    const groupUrl = new URL(`${evolutionUrl}/group/findGroupInfos/${instanceName}`)
    groupUrl.searchParams.set('groupJid', remoteJid)

    const res = await fetch(groupUrl.toString(), {
      method: 'GET',
      headers: {
        'apikey': evolutionKey,
      },
    })

    const data = await res.json().catch(() => ({}))
    const group = data?.group || data
    if (res.ok && (group?.subject || group?.pictureUrl)) {
      return {
        subject: group?.subject || null,
        pictureUrl: group?.pictureUrl || null,
      }
    }
  } catch (error) {
    console.error('[whatsapp-contact-profiles] Falha ao buscar group info direta:', error)
  }

  try {
    const groupsUrl = new URL(`${evolutionUrl}/group/fetchAllGroups/${instanceName}`)
    groupsUrl.searchParams.set('getParticipants', 'false')

    const res = await fetch(groupsUrl.toString(), {
      method: 'GET',
      headers: {
        'apikey': evolutionKey,
      },
    })

    const data = await res.json().catch(() => ({}))
    const groups = Array.isArray(data)
      ? data
      : Array.isArray(data?.groups)
        ? data.groups
        : []
    const group = groups.find((item) => item?.id === remoteJid)
    if (res.ok && group) {
      return {
        subject: group?.subject || null,
        pictureUrl: group?.pictureUrl || null,
      }
    }
  } catch (error) {
    console.error('[whatsapp-contact-profiles] Falha ao buscar group info via fetchAllGroups:', error)
  }

  return {
    subject: null,
    pictureUrl: null,
  }
}

async function upsertConversationProjection(
  sb: ReturnType<typeof createClient>,
  entry: {
    instanceName: string
    remoteJid: string
    chatType: 'direct' | 'group'
    displayName?: string | null
    profilePictureUrl?: string | null
  }
) {
  try {
    await sb.rpc('upsert_chat_conversation_projection', {
      p_instance_name: entry.instanceName,
      p_remote_jid: entry.remoteJid,
      p_canonical_remote_jid: entry.remoteJid,
      p_phone_normalized: entry.chatType === 'direct' && !entry.remoteJid.endsWith('@lid')
        ? entry.remoteJid.replace(/@.*$/, '')
        : null,
      p_chat_type: entry.chatType,
      p_lead_id: null,
      p_display_name: entry.displayName || null,
      p_profile_picture_url: entry.profilePictureUrl || null,
      p_last_message_preview: null,
      p_last_message_at: null,
      p_last_message_from_me: false,
    })
  } catch (error) {
    console.error('[whatsapp-contact-profiles] Falha ao projetar conversa:', error)
  }
}

async function resolveLatestIncomingPushName(
  sb: ReturnType<typeof createClient>,
  entry: {
    instanceName: string
    remoteJid: string
    instanceDisplayName?: string | null
  }
) {
  try {
    const { data } = await sb
      .from('chat_messages')
      .select('metadata, message_timestamp, created_at')
      .eq('instance_name', entry.instanceName)
      .eq('canonical_remote_jid', entry.remoteJid)
      .eq('from_me', false)
      .order('created_at', { ascending: false })
      .limit(15)

    for (const row of data || []) {
      const pushName = typeof row?.metadata?.pushName === 'string' ? row.metadata.pushName.trim() : ''
      if (!pushName) continue
      if (entry.instanceDisplayName && pushName === entry.instanceDisplayName) continue
      return pushName
    }
  } catch (error) {
    console.error('[whatsapp-contact-profiles] Falha ao resolver pushName por histórico:', error)
  }

  return null
}

function isFresh(lastSyncedAt?: string | null) {
  if (!lastSyncedAt) return false
  const ageMs = Date.now() - new Date(lastSyncedAt).getTime()
  return ageMs < 1000 * 60 * 60 * 24
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { session_token, instance_name, remote_jids = [] } = await req.json()

    if (!session_token) return json({ error: 'Sessao invalida.' }, 401)
    if (!instance_name) return json({ error: 'instance_name obrigatorio.' }, 400)

    const requestedJids = Array.isArray(remote_jids)
      ? [...new Set(remote_jids
          .filter((jid) => typeof jid === 'string' && jid.trim())
          .map((jid) => canonicalizeRemoteJid(jid))
          .slice(0, 30))]
      : []

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

    const { data: instance } = await sb
      .from('whatsapp_instances')
      .select('id, display_name')
      .eq('instance_name', instance_name)
      .eq('usuario_id', sessao.usuario_id)
      .single()
    if (!instance) return json({ error: 'Instancia nao encontrada para este usuario.' }, 404)

    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL')
    const evolutionKey = Deno.env.get('EVOLUTION_GLOBAL_KEY')
    if (!evolutionUrl || !evolutionKey) return json({ error: 'Evolution API nao configurada.' }, 500)

    const { data: existing } = requestedJids.length > 0
      ? await sb
          .from('chat_contact_profiles')
          .select('remote_jid, push_name, profile_picture_url, last_synced_at')
          .eq('instance_name', instance_name)
          .in('remote_jid', requestedJids)
      : { data: [] }

    const existingMap = new Map((existing || []).map((item) => [item.remote_jid, item]))

    for (const remoteJid of requestedJids) {
      const current = existingMap.get(remoteJid)
      if (shouldSkipRefresh(current, remoteJid, instance.display_name || null)) continue

      try {
        let pushName = current?.push_name || null
        let profilePictureUrl = current?.profile_picture_url || null

        if (isGroupJid(remoteJid)) {
          const groupInfo = await fetchGroupInfo(evolutionUrl, evolutionKey, instance_name, remoteJid)
          pushName = groupInfo.subject || pushName
          profilePictureUrl = groupInfo.pictureUrl || profilePictureUrl
        } else {
          const res = await fetch(`${evolutionUrl}/chat/fetchProfilePictureUrl/${instance_name}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': evolutionKey,
            },
            body: JSON.stringify({
              number: normalizeRemoteTarget(remoteJid),
            }),
          })

          const data = await res.json().catch(() => ({}))
          if (res.ok) {
            profilePictureUrl = data?.profilePictureUrl || null
          }
        }

        if (!pushName) {
          pushName = await resolveLatestIncomingPushName(sb, {
            instanceName: instance_name,
            remoteJid,
            instanceDisplayName: instance.display_name || null,
          })
        }

        const upsertPayload = {
          instance_name,
          remote_jid: remoteJid,
          push_name: pushName,
          profile_picture_url: profilePictureUrl,
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

        await sb
          .from('chat_contact_profiles')
          .upsert(upsertPayload, { onConflict: 'instance_name,remote_jid' })

        existingMap.set(remoteJid, upsertPayload)
        await upsertConversationProjection(sb, {
          instanceName: instance_name,
          remoteJid,
          chatType: isGroupJid(remoteJid) ? 'group' : 'direct',
          displayName: pushName,
          profilePictureUrl,
        })
      } catch (err) {
        console.error('[whatsapp-contact-profiles]', err)
      }
    }

    return json({
      ok: true,
      profiles: requestedJids.map((remoteJid) => ({
        remote_jid: remoteJid,
        push_name: existingMap.get(remoteJid)?.push_name || null,
        profile_picture_url: existingMap.get(remoteJid)?.profile_picture_url || null,
      })),
    })
  } catch (e) {
    console.error('[whatsapp-contact-profiles]', e)
    return json({ error: 'Erro interno.' }, 500)
  }
})
