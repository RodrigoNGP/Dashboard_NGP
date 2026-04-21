import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { handleCors, json } from "../_shared/cors.ts"
import { validateSession, isAdmin } from "../_shared/roles.ts"

const FIELD_BY_TIPO = {
  cargo: 'cargo',
  funcao: 'funcao',
  senioridade: 'senioridade',
} as const

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const { session_token, id } = await req.json()

    if (!session_token) return json(req, { error: 'Sessão inválida.' }, 401)
    if (!id) return json(req, { error: 'Cadastro é obrigatório.' }, 400)

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const user = await validateSession(sb, session_token)

    if (!user) return json(req, { error: 'Sessão expirada.' }, 401)
    if (!isAdmin(user.role)) return json(req, { error: 'Acesso negado.' }, 403)

    const { data: cadastro, error: cadastroError } = await sb
      .from('carreira_cadastros')
      .select('id, tipo, nome, ativo')
      .eq('id', id)
      .maybeSingle()

    if (cadastroError || !cadastro) {
      console.error('[admin-carreira-delete-cadastro] fetch error:', cadastroError)
      return json(req, { error: 'Cadastro não encontrado.' }, 404)
    }

    const field = FIELD_BY_TIPO[cadastro.tipo as keyof typeof FIELD_BY_TIPO]
    if (!field) return json(req, { error: 'Tipo inválido.' }, 400)

    const { data: vinculo, error: vinculoError } = await sb
      .from('usuarios')
      .select('id')
      .eq(field, cadastro.nome)
      .in('role', ['admin', 'ngp'])
      .limit(1)
      .maybeSingle()

    if (vinculoError) {
      console.error('[admin-carreira-delete-cadastro] uso error:', vinculoError)
      return json(req, { error: 'Erro ao validar uso do cadastro.' }, 500)
    }

    if (vinculo) {
      return json(req, { error: 'Esse cadastro está em uso no perfil de um colaborador.' }, 409)
    }

    const { error } = await sb
      .from('carreira_cadastros')
      .update({
        ativo: false,
        updated_by: user.usuario_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      console.error('[admin-carreira-delete-cadastro] delete error:', error)
      return json(req, { error: 'Erro ao excluir cadastro.' }, 500)
    }

    return json(req, { ok: true })
  } catch (e) {
    console.error('[admin-carreira-delete-cadastro] Error:', e)
    return json(req, { error: 'Erro interno.' }, 500)
  }
})
