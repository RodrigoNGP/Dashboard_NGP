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

function canonicalizeRemoteJid(remoteJid: string): string {
  if (remoteJid.includes('@g.us') || remoteJid.endsWith('@lid')) return remoteJid
  const normalized = remoteJid.replace(/@.*$/, '').replace(/[^0-9]/g, '')
  if (normalized) return `${normalized}@s.whatsapp.net`
  return remoteJid
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { session_token, instance_name, remote_jid, canonical_remote_jid, suggestions_enabled, last_read_at } = await req.json()

    if (!session_token) return json({ error: 'Sessao invalida.' }, 401)
    const resolvedRemoteJid = (canonical_remote_jid || remote_jid || '').trim()
    if (!instance_name || !resolvedRemoteJid) return json({ error: 'instance_name e remote_jid sao obrigatorios.' }, 400)
    const canonicalRemoteJid = canonicalizeRemoteJid(resolvedRemoteJid)

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
      .select('id')
      .eq('instance_name', instance_name)
      .eq('usuario_id', sessao.usuario_id)
      .single()
    if (!instance) return json({ error: 'Instancia nao encontrada para este usuario.' }, 404)

    if (typeof suggestions_enabled === 'boolean' || typeof last_read_at === 'string') {
      const payload: Record<string, unknown> = {
        instance_name,
        remote_jid: remote_jid || canonicalRemoteJid,
        canonical_remote_jid: canonicalRemoteJid,
        updated_at: new Date().toISOString(),
      }
      if (typeof suggestions_enabled === 'boolean') payload.suggestions_enabled = suggestions_enabled
      if (typeof last_read_at === 'string') payload.last_read_at = last_read_at

      const { error } = await sb
        .from('chat_conversation_settings')
        .upsert(
          payload,
          { onConflict: 'instance_name,canonical_remote_jid' }
        )

      if (error) return json({ error: 'Nao foi possivel salvar a configuracao da conversa.' }, 500)
    }

    const { data: settings } = await sb
      .from('chat_conversation_settings')
      .select('suggestions_enabled, last_read_at')
      .eq('instance_name', instance_name)
      .eq('canonical_remote_jid', canonicalRemoteJid)
      .maybeSingle()

    return json({
      ok: true,
      suggestions_enabled: settings?.suggestions_enabled ?? true,
      last_read_at: settings?.last_read_at ?? null,
    })
  } catch (e) {
    console.error('[whatsapp-conversation-settings]', e)
    return json({ error: 'Erro interno.' }, 500)
  }
})
