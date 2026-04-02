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
    const { session_token, cloudId, dados, titulo, periodo, cliente_username } = await req.json()

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

    if (cloudId) {
      // Update
      const updatePayload: Record<string, unknown> = {
        dados, titulo, periodo, updated_at: new Date().toISOString(),
      }
      if (cliente_username) updatePayload.cliente_username = cliente_username

      const { error } = await sb
        .from('relatorios')
        .update(updatePayload)
        .eq('id', cloudId)

      if (error) {
        console.error('[save-relatorio] update error:', JSON.stringify(error))
        return new Response(JSON.stringify({ error: errMsg(error) }), {
          status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ ok: true, id: cloudId }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    } else {
      // Insert
      const insertPayload: Record<string, unknown> = {
        dados, titulo, periodo,
        criado_por: sessao.usuario_id,
      }
      if (cliente_username) insertPayload.cliente_username = cliente_username

      const { data, error } = await sb
        .from('relatorios')
        .insert(insertPayload)
        .select('id')
        .single()

      if (error) {
        console.error('[save-relatorio] insert error:', JSON.stringify(error))
        return new Response(JSON.stringify({ error: errMsg(error) }), {
          status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ ok: true, id: data.id }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

  } catch (e) {
    console.error('[save-relatorio] catch:', e)
    return new Response(JSON.stringify({ error: errMsg(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
