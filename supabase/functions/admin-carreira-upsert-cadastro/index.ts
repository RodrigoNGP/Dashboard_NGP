import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { handleCors, json } from "../_shared/cors.ts"
import { validateSession, isAdmin } from "../_shared/roles.ts"

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const { session_token, tipo, nome } = await req.json()

    if (!session_token) return json(req, { error: 'Sessão inválida.' }, 401)
    if (!tipo || !['cargo', 'funcao', 'senioridade'].includes(tipo)) {
      return json(req, { error: 'Tipo inválido.' }, 400)
    }

    const nomeLimpo = String(nome || '').trim()
    if (!nomeLimpo) return json(req, { error: 'Nome é obrigatório.' }, 400)

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const user = await validateSession(sb, session_token)

    if (!user) return json(req, { error: 'Sessão expirada.' }, 401)
    if (!isAdmin(user.role)) return json(req, { error: 'Acesso negado.' }, 403)

    const { data: existente } = await sb
      .from('carreira_cadastros')
      .select('id')
      .eq('tipo', tipo)
      .ilike('nome', nomeLimpo)
      .maybeSingle()

    if (existente) {
      return json(req, { error: 'Esse cadastro já existe.' }, 409)
    }

    const timestamp = new Date().toISOString()
    const { data: cadastro, error } = await sb
      .from('carreira_cadastros')
      .insert({
        tipo,
        nome: nomeLimpo,
        ativo: true,
        created_by: user.usuario_id,
        updated_by: user.usuario_id,
        updated_at: timestamp,
      })
      .select('id, tipo, nome, ativo, created_at, updated_at')
      .single()

    if (error) {
      console.error('[admin-carreira-upsert-cadastro] error:', error)
      return json(req, { error: 'Erro ao salvar cadastro.' }, 500)
    }

    return json(req, { cadastro })
  } catch (e) {
    console.error('[admin-carreira-upsert-cadastro] Error:', e)
    return json(req, { error: 'Erro interno.' }, 500)
  }
})
