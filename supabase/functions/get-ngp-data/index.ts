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
    const { session_token } = await req.json()

    if (!session_token) {
      return new Response(JSON.stringify({ error: 'Sessão inválida.' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const SURL = Deno.env.get('SUPABASE_URL')!
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const sb = createClient(SURL, SERVICE)

    // Valida sessão
    const { data: sessao } = await sb
      .from('sessions')
      .select('usuario_id')
      .eq('token', session_token)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (!sessao) {
      return new Response(JSON.stringify({ error: 'Sessão expirada.' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Verifica se é NGP
    const { data: usuario } = await sb
      .from('usuarios')
      .select('role')
      .eq('id', sessao.usuario_id)
      .single()

    if (!usuario || usuario.role !== 'ngp') {
      return new Response(JSON.stringify({ error: 'Acesso negado.' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Busca todos os clientes
    const { data: clientes } = await sb
      .from('usuarios')
      .select('id, username, nome, meta_account_id, foto_url')
      .eq('role', 'cliente')

    return new Response(JSON.stringify({ clientes: clientes || [] }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (e) {
    console.error('[get-ngp-data] Error:', e)
    return new Response(JSON.stringify({ error: 'Erro interno.' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
