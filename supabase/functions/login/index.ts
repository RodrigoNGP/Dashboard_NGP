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
    const { username, password, role } = await req.json()

    if (!username || !password || !role) {
      return new Response(JSON.stringify({ error: 'Parâmetros inválidos.' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const SURL = Deno.env.get('SUPABASE_URL')!
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const sb = createClient(SURL, SERVICE)

    // Buscar usuário por username e role
    const { data: usuario, error: usuarioError } = await sb
      .from('usuarios')
      .select('id, username, nome, password_hash, role, meta_account_id, ativo, foto_url')
      .eq('username', username.toLowerCase())
      .eq('role', role)
      .single()

    if (usuarioError || !usuario || !usuario.ativo) {
      return new Response(JSON.stringify({ error: 'Usuário ou senha incorretos.' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Validar senha (comparação simples para agora)
    if (usuario.password_hash !== password) {
      return new Response(JSON.stringify({ error: 'Usuário ou senha incorretos.' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Gerar token de sessão
    const sessionToken = crypto.getRandomValues(new Uint8Array(32))
      .reduce((s, b) => s + b.toString(16).padStart(2, '0'), '')

    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString()

    // Criar sessão
    const { error: sessionError } = await sb
      .from('sessions')
      .insert({
        token: sessionToken,
        usuario_id: usuario.id,
        expires_at: expiresAt,
      })

    if (sessionError) {
      console.error('[login] Session error:', sessionError)
      return new Response(JSON.stringify({ error: 'Erro ao criar sessão.' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      session_token: sessionToken,
      user: {
        nome: usuario.nome,
        username: usuario.username,
        role: usuario.role,
        meta_account_id: usuario.meta_account_id || undefined,
        foto_url: usuario.foto_url || undefined,
      },
      expires_at: expiresAt,
    }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (e) {
    console.error('[login] Error:', e)
    return new Response(JSON.stringify({ error: 'Erro interno.' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
