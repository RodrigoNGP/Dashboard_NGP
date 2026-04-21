import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { handleCors, json } from "../_shared/cors.ts"
import { validateSession, isAdmin } from "../_shared/roles.ts"

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const { session_token, id } = await req.json()

    if (!session_token) return json(req, { error: 'Sessão inválida.' }, 401)
    if (!id) return json(req, { error: 'Feedback é obrigatório.' }, 400)

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const user = await validateSession(sb, session_token)

    if (!user) return json(req, { error: 'Sessão expirada.' }, 401)
    if (!isAdmin(user.role)) return json(req, { error: 'Apenas ADM pode excluir feedbacks.' }, 403)

    const { error } = await sb
      .from('carreira_reunioes')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[admin-carreira-delete-reuniao] delete error:', error)
      return json(req, { error: 'Erro ao excluir feedback.' }, 500)
    }

    return json(req, { ok: true })
  } catch (e) {
    console.error('[admin-carreira-delete-reuniao] Error:', e)
    return json(req, { error: 'Erro interno.' }, 500)
  }
})
