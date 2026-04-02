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
    const { session_token } = await req.json()

    if (!session_token) {
      return json({ error: 'Sessão inválida.' }, 401)
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
      .select('meta_token')
      .eq('id', sessao.usuario_id)
      .eq('role', 'ngp')
      .single()

    if (!usuario?.meta_token) {
      return json({ error: 'Token Meta não configurado.' }, 403)
    }

    // Descobrir todas as contas de anúncio
    const accountsUrl = new URL('https://graph.facebook.com/v19.0/me/adaccounts')
    accountsUrl.searchParams.set('fields', 'id,name,account_status,currency')
    accountsUrl.searchParams.set('access_token', usuario.meta_token)

    const accountsRes = await fetch(accountsUrl.toString(), {
      signal: AbortSignal.timeout(15000)
    })
    const accountsData = await accountsRes.json()

    if (accountsData?.error) {
      console.error('[discover-meta-accounts] Meta API error:', accountsData.error)
      return json({ error: 'Erro ao consultar contas Meta.' }, 502)
    }

    return json({
      accounts: accountsData.data || []
    })

  } catch (e) {
    console.error('[discover-meta-accounts] Error:', e)
    return json({ error: 'Erro interno.' }, 500)
  }
})
