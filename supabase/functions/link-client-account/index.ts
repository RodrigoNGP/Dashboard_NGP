import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const { session_token, cliente_id, meta_account_id } = await req.json()

    if (!session_token || !cliente_id || !meta_account_id) {
      return json({ error: 'Parâmetros inválidos.' }, 400)
    }

    const SURL = Deno.env.get('SUPABASE_URL')!
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const sb = createClient(SURL, SERVICE)

    // Validar sessão e verificar se é NGP
    const { data: sessao } = await sb
      .from('sessions')
      .select('usuario_id')
      .eq('token', session_token)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (!sessao) {
      return json({ error: 'Sessão expirada.' }, 401)
    }

    const { data: usuario } = await sb
      .from('usuarios')
      .select('role')
      .eq('id', sessao.usuario_id)
      .single()

    if (usuario?.role !== 'ngp') {
      return json({ error: 'Acesso negado.' }, 403)
    }

    // Atualizar meta_account_id do cliente
    const { error } = await sb
      .from('usuarios')
      .update({ meta_account_id })
      .eq('id', cliente_id)
      .eq('role', 'cliente')

    if (error) {
      console.error('[link-client-account] Update error:', error)
      return json({ error: 'Erro ao vincular conta.' }, 500)
    }

    return json({ ok: true })

  } catch (e) {
    console.error('[link-client-account] Error:', e)
    return json({ error: 'Erro interno.' }, 500)
  }
})
