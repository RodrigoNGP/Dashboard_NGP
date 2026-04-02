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
    const { session_token, nome, password_new, foto_url } = await req.json()

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

    // Atualiza usuário
    const updateData: Record<string, unknown> = {}
    if (nome) updateData.nome = nome
    if (password_new) updateData.password_hash = password_new
    if (foto_url) updateData.foto_url = foto_url

    if (Object.keys(updateData).length === 0) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const { error } = await sb
      .from('usuarios')
      .update(updateData)
      .eq('id', sessao.usuario_id)

    if (error) {
      console.error('[update-profile] error:', JSON.stringify(error))
      return new Response(JSON.stringify({ error: errMsg(error) }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (e) {
    console.error('[update-profile] catch:', e)
    return new Response(JSON.stringify({ error: errMsg(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
