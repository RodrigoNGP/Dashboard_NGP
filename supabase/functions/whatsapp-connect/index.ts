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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { session_token, action, instance_name, display_name } = await req.json()

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

    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL')
    const evolutionKey = Deno.env.get('EVOLUTION_GLOBAL_KEY')
    const webhookUrl   = Deno.env.get('WEBHOOK_URL') // URL publica da funcao whatsapp-webhook
    if (!evolutionUrl || !evolutionKey) return json({ error: 'Evolution API nao configurada.' }, 500)

    // ── action: create — cria instancia e retorna QR ──────────────────────────
    if (action === 'create') {
      if (!instance_name) return json({ error: 'instance_name obrigatorio.' }, 400)

      // Verifica se já existe instância com esse nome para este usuário
      const { data: existing } = await sb
        .from('whatsapp_instances')
        .select('id')
        .eq('usuario_id', sessao.usuario_id)
        .eq('instance_name', instance_name)
        .single()
      if (existing) return json({ error: 'Ja existe uma instancia com esse nome.' }, 409)

      // Cria na Evolution API
      const createBody: Record<string, unknown> = {
        instanceName: instance_name,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
      }
      if (webhookUrl) {
        createBody.webhook = {
          url: webhookUrl,
          byEvents: false,
          base64: false,
          events: ['MESSAGES_UPSERT'],
        }
      }

      const res = await fetch(`${evolutionUrl}/instance/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': evolutionKey },
        body: JSON.stringify(createBody),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = res.status === 403
          ? 'Nome ja em uso. Escolha outro nome para a instancia.'
          : data?.message || `Erro ${res.status} ao criar instancia.`
        return json({ error: msg }, 502)
      }

      // Salva no banco como 'pending'
      await sb.from('whatsapp_instances').insert({
        instance_name,
        display_name: display_name || instance_name,
        status: 'pending',
        usuario_id: sessao.usuario_id,
        metadata: { evolution_id: data?.instance?.instanceId || null },
      })

      return json({
        ok: true,
        qr_code: data?.qrcode?.base64 || null,
        pairing_code: data?.qrcode?.pairingCode || null,
      })
    }

    // ── action: status — verifica se conectou e atualiza banco ───────────────
    if (action === 'status') {
      if (!instance_name) return json({ error: 'instance_name obrigatorio.' }, 400)

      const res = await fetch(`${evolutionUrl}/instance/connectionState/${instance_name}`, {
        headers: { 'apikey': evolutionKey },
      })
      const data = await res.json().catch(() => ({}))
      const state = data?.instance?.state || data?.state || 'unknown'

      if (state === 'open') {
        // Atualiza status no banco
        await sb.from('whatsapp_instances')
          .update({ status: 'connected' })
          .eq('instance_name', instance_name)
          .eq('usuario_id', sessao.usuario_id)
      }

      return json({ state })
    }

    // ── action: qr — busca QR atualizado (expira a cada ~20s) ────────────────
    if (action === 'qr') {
      if (!instance_name) return json({ error: 'instance_name obrigatorio.' }, 400)

      const res = await fetch(`${evolutionUrl}/instance/connect/${instance_name}`, {
        headers: { 'apikey': evolutionKey },
      })
      const data = await res.json().catch(() => ({}))

      return json({
        ok: true,
        qr_code: data?.base64 || null,
        pairing_code: data?.pairingCode || null,
      })
    }

    // ── action: delete — remove instância ────────────────────────────────────
    if (action === 'delete') {
      if (!instance_name) return json({ error: 'instance_name obrigatorio.' }, 400)

      await fetch(`${evolutionUrl}/instance/delete/${instance_name}`, {
        method: 'DELETE',
        headers: { 'apikey': evolutionKey },
      }).catch(() => {})

      await sb.from('whatsapp_instances')
        .delete()
        .eq('instance_name', instance_name)
        .eq('usuario_id', sessao.usuario_id)

      return json({ ok: true })
    }

    return json({ error: 'Acao invalida.' }, 400)
  } catch (e) {
    console.error('[whatsapp-connect]', e)
    return json({ error: 'Erro interno.' }, 500)
  }
})
