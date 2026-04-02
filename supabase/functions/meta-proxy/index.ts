import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS })

  try {
    const body = await req.json()
    const { session_token, endpoint, params = {}, account_id } = body

    if (!session_token || !endpoint) {
      return new Response(JSON.stringify({ error: 'Parâmetros inválidos.' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const SURL = Deno.env.get('SUPABASE_URL')!
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const sb = createClient(SURL, SERVICE)

    // 1. Validar sessão
    const { data: sessions } = await sb
      .from('sessions')
      .select('usuario_id, expires_at')
      .eq('token', session_token)
      .gt('expires_at', new Date().toISOString())
      .limit(1)

    if (!sessions?.length) {
      return new Response(JSON.stringify({ error: 'Sessão inválida ou expirada.' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // 2. Buscar usuário
    const { data: usuario } = await sb
      .from('usuarios')
      .select('role, meta_account_id, ativo')
      .eq('id', sessions[0].usuario_id)
      .single()

    if (!usuario || !usuario.ativo) {
      return new Response(JSON.stringify({ error: 'Usuário inativo.' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // 3. Determinar account_id autorizado
    let accountId = account_id || usuario.meta_account_id
    if (!accountId) {
      return new Response(JSON.stringify({ error: 'Conta de anúncio não configurada.' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    accountId = String(accountId).replace(/^act_/, '')

    // 4. Buscar meta_token
    const { data: ngpUser } = await sb
      .from('usuarios')
      .select('meta_token')
      .eq('id', sessions[0].usuario_id)
      .single()

    const metaToken = ngpUser?.meta_token || Deno.env.get('META_ACCESS_TOKEN')
    if (!metaToken) {
      return new Response(JSON.stringify({ error: 'Meta token não configurado.' }), {
        status: 503, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // 5. Construir URL
    const normalizedEndpoint = endpoint.replace(/^\{account_id\}\//, '')
    let url = `https://graph.facebook.com/v19.0/${normalizedEndpoint}`

    if (!normalizedEndpoint.includes('/')) {
      url = `https://graph.facebook.com/v19.0/act_${accountId}/${normalizedEndpoint}`
    }

    // 6. Adicionar parâmetros
    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' || typeof value === 'number') {
        searchParams.set(key, String(value))
      }
    }
    searchParams.set('access_token', metaToken)

    url += '?' + searchParams.toString()

    console.log('[meta-proxy] Calling:', url.replace(metaToken, 'TOKEN'))

    // 7. Chamar Meta API
    const metaRes = await fetch(url, { signal: AbortSignal.timeout(15000) })
    const metaData = await metaRes.json()

    if (metaData?.error) {
      console.error('[meta-proxy] Meta error:', metaData.error)
      return new Response(JSON.stringify({ error: 'Erro ao consultar Meta API.' }), {
        status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify(metaData), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (e) {
    console.error('[meta-proxy] Error:', e)
    return new Response(JSON.stringify({ error: 'Erro interno.' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
