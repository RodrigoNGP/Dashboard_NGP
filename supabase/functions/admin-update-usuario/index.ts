import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { handleCors, json } from "../_shared/cors.ts"
import { validateSession, isAdmin } from "../_shared/roles.ts"

const PBKDF2_ITERATIONS = 100_000

async function hashPassword(password: string, salt?: Uint8Array): Promise<string> {
  if (!salt) {
    salt = crypto.getRandomValues(new Uint8Array(16))
  }
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key, 256
  )
  const hashHex = Array.from(new Uint8Array(derived)).map((b) => b.toString(16).padStart(2, '0')).join('')
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, '0')).join('')
  return `pbkdf2:${saltHex}:${hashHex}`
}

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const { session_token, usuario_id, nome, email, password, ativo } = await req.json()

    if (!session_token) return json(req, { error: 'Sessão inválida.' }, 401)
    if (!usuario_id) return json(req, { error: 'Usuário é obrigatório.' }, 400)
    if (!nome || !email) return json(req, { error: 'Nome e e-mail são obrigatórios.' }, 400)

    const emailClean = String(email).toLowerCase().trim()
    if (!emailClean.includes('@')) return json(req, { error: 'E-mail inválido.' }, 400)
    if (password && String(password).length < 6) return json(req, { error: 'A senha deve ter pelo menos 6 caracteres.' }, 400)

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const user = await validateSession(sb, session_token)

    if (!user) return json(req, { error: 'Sessão expirada.' }, 401)
    if (!isAdmin(user.role)) return json(req, { error: 'Acesso negado.' }, 403)

    const { data: alvo, error: alvoError } = await sb
      .from('usuarios')
      .select('id, auth_user_id, role')
      .eq('id', usuario_id)
      .in('role', ['admin', 'ngp'])
      .single()

    if (alvoError || !alvo) {
      console.error('[admin-update-usuario] alvo error:', alvoError)
      return json(req, { error: 'Usuário não encontrado.' }, 404)
    }

    const { data: emailEmUso } = await sb
      .from('usuarios')
      .select('id')
      .eq('email', emailClean)
      .neq('id', usuario_id)
      .maybeSingle()

    if (emailEmUso) return json(req, { error: 'Esse e-mail já está em uso.' }, 409)

    const updateData: Record<string, unknown> = {
      nome: String(nome).trim(),
      email: emailClean,
      username: emailClean,
      ativo: ativo !== false,
    }

    if (password) {
      updateData.password_hash = await hashPassword(String(password))
    }

    const { data: updated, error: updateError } = await sb
      .from('usuarios')
      .update(updateData)
      .eq('id', usuario_id)
      .select('id, nome, username, email, role, ativo, foto_url, cargo, funcao, senioridade, gestor_usuario, objetivo_profissional_resumo')
      .single()

    if (updateError) {
      console.error('[admin-update-usuario] update error:', updateError)
      return json(req, { error: 'Erro ao atualizar usuário.' }, 500)
    }

    if (alvo.auth_user_id) {
      const authPayload: { email?: string; password?: string; user_metadata?: Record<string, unknown>; ban_duration?: string } = {
        email: emailClean,
        user_metadata: { nome: String(nome).trim() },
      }
      if (password) authPayload.password = String(password)
      if (ativo === false) authPayload.ban_duration = 'none'

      const { error: authError } = await sb.auth.admin.updateUserById(alvo.auth_user_id, authPayload)
      if (authError) {
        console.error('[admin-update-usuario] auth error:', authError)
      }
    }

    return json(req, { usuario: updated })
  } catch (e) {
    console.error('[admin-update-usuario] Error:', e)
    return json(req, { error: 'Erro interno.' }, 500)
  }
})
