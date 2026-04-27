import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, json } from '../_shared/cors.ts'
import { isNgp, validateSession } from '../_shared/roles.ts'

const MAX_SNAPSHOT_CHARS = 180000

function cleanText(value: unknown, max = 160) {
  return String(value || '').trim().slice(0, max)
}

function normalizeMetaAccountId(value: unknown) {
  return cleanText(value, 80).replace(/^act_/, '')
}

function safeSnapshot(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const raw = JSON.stringify(value)
  if (raw.length > MAX_SNAPSHOT_CHARS) return null
  return value as Record<string, unknown>
}

async function getSessionActor(sb: ReturnType<typeof createClient>, sessionToken: string) {
  const session = await validateSession(sb, sessionToken)
  if (!session) return null

  const { data: usuario } = await sb
    .from('usuarios')
    .select('id, username, nome, role, meta_account_id')
    .eq('id', session.usuario_id)
    .single()

  if (!usuario) return null
  return usuario
}

function canAccessClient(
  actor: { id: string; username: string; role: string; meta_account_id?: string | null },
  clienteId?: string,
  clienteUsername?: string,
  metaAccountId?: string,
) {
  if (isNgp(actor.role)) return true
  if (actor.role !== 'cliente') return false
  if (clienteId && clienteId === actor.id) return true
  if (clienteUsername && clienteUsername === actor.username) return true
  if (metaAccountId && normalizeMetaAccountId(actor.meta_account_id) === normalizeMetaAccountId(metaAccountId)) return true
  return false
}

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const { session_token, action = 'latest', ...params } = await req.json()
    if (!session_token) return json(req, { error: 'Sessão inválida.' }, 401)

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const actor = await getSessionActor(sb, session_token)
    if (!actor) return json(req, { error: 'Sessão expirada. Faça login novamente.' }, 401)

    if (action === 'save') {
      const snapshot = safeSnapshot(params.snapshot)
      if (!snapshot) {
        return json(req, { error: 'Snapshot inválido ou acima do limite de segurança.' }, 400)
      }

      const client = snapshot.client as Record<string, unknown> | undefined
      const period = snapshot.period as Record<string, unknown> | undefined
      const clienteId = cleanText(client?.id, 80) || undefined
      const clienteUsername = cleanText(client?.username, 120) || undefined
      const clienteNome = cleanText(client?.name, 160) || null
      const metaAccountId = normalizeMetaAccountId(client?.metaAccountId)
      const periodLabel = cleanText(period?.label, 120)

      if (!metaAccountId || !periodLabel) {
        return json(req, { error: 'Snapshot sem conta Meta ou período válido.' }, 400)
      }

      if (!canAccessClient(actor, clienteId, clienteUsername, metaAccountId)) {
        return json(req, { error: 'Acesso negado.' }, 403)
      }

      const payload = {
        source: cleanText(snapshot.source, 80) || 'dashboard_meta_ads',
        schema_version: Number(snapshot.schemaVersion || 1) || 1,
        cliente_id: clienteId || null,
        cliente_username: clienteUsername || null,
        cliente_nome: clienteNome,
        meta_account_id: metaAccountId,
        period_label: periodLabel,
        snapshot,
        created_by: actor.id,
        updated_at: new Date().toISOString(),
      }

      const { data, error } = await sb
        .from('analytics_snapshots')
        .upsert(payload, {
          onConflict: 'created_by,source,meta_account_id,period_label',
        })
        .select('id, source, schema_version, cliente_id, cliente_username, cliente_nome, meta_account_id, period_label, snapshot, created_at, updated_at')
        .single()

      if (error) throw error
      return json(req, { snapshot: data })
    }

    if (action !== 'latest') {
      return json(req, { error: `Action '${action}' desconhecida.` }, 400)
    }

    const clienteId = cleanText(params.cliente_id, 80) || undefined
    const clienteUsername = cleanText(params.cliente_username, 120) || undefined
    const metaAccountId = normalizeMetaAccountId(params.meta_account_id) || undefined

    if (!canAccessClient(actor, clienteId, clienteUsername, metaAccountId)) {
      return json(req, { error: 'Acesso negado.' }, 403)
    }

    let query = sb
      .from('analytics_snapshots')
      .select('id, source, schema_version, cliente_id, cliente_username, cliente_nome, meta_account_id, period_label, snapshot, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)

    if (clienteId) query = query.eq('cliente_id', clienteId)
    else if (clienteUsername) query = query.eq('cliente_username', clienteUsername)
    else if (metaAccountId) query = query.eq('meta_account_id', metaAccountId)
    else if (actor.role === 'cliente') query = query.eq('cliente_id', actor.id)
    else query = query.eq('created_by', actor.id)

    const { data, error } = await query.maybeSingle()
    if (error) throw error
    return json(req, { snapshot: data || null })
  } catch (error) {
    console.error('[analytics-snapshots]', error)
    return json(req, { error: 'Erro interno ao processar snapshots analíticos.' }, 500)
  }
})
