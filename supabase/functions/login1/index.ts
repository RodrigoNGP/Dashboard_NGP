import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const errMsg = (e: unknown): string => {
  if (!e) return 'Erro desconhecido'
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  const obj = e as Record<string, unknown>
  return String(obj.message || obj.details || obj.hint || obj.code || JSON.stringify(e))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const { username, password } = await req.json()

    if (!username || !password) {
      return new Response(JSON.stringify({ error: 'Username e senha obrigatórios.' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const SURL = Deno.env.get('SUPABASE_URL')!
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const sb = createClient(SURL, SERVICE)

    // Busca usuário por username
    const { data: usuario } = await sb
      .from('usuarios')
      .select('id, nome, username, role, meta_account_id, foto_url')
      .eq('username', username.toLowerCase())
      .single()

    if (!usuario) {
      return new Response(JSON.stringify({ error: 'Usuário não encontrado.' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Valida senha (simples comparação para demo — em prod use bcrypt)
    const { data: passData } = await sb
      .from('usuarios')
      .select('password_hash')
      .eq('id', usuario.id)
      .single()

    if (!passData || passData.password_hash !== password) {
      return new Response(JSON.stringify({ error: 'Senha incorreta.' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Cria sessão
    const token = crypto.getRandomValues(new Uint8Array(32))
    const tokenHex = Array.from(token).map(b => b.toString(16).padStart(2, '0')).join('')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const { error: sesError } = await sb.from('sessions').insert({
      token: tokenHex,
      usuario_id: usuario.id,
      expires_at: expiresAt,
    })

    if (sesError) {
      console.error('[login1] session insert error:', JSON.stringify(sesError))
      return new Response(JSON.stringify({ error: 'Erro ao criar sessão.' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      auth: '1',
      session: tokenHex,
      user: usuario.nome,
      username: usuario.username,
      role: usuario.role,
      expires: expiresAt,
      metaAccount: usuario.meta_account_id,
      foto: usuario.foto_url,
    }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (e) {
    console.error('[login1] catch:', e)
    return new Response(JSON.stringify({ error: errMsg(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
