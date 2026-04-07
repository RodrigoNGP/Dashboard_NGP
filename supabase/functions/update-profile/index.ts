import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts"
import { handleCors, json } from "../_shared/cors.ts"

const errMsg = (e: unknown): string => {
  if (!e) return 'Erro desconhecido'
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  const obj = e as Record<string, unknown>
  return String(obj.message || obj.details || obj.hint || obj.code || JSON.stringify(e))
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const { session_token, nome, password_new, foto_url } = await req.json()

    if (!session_token) {
      return json(req, { error: 'Sessão inválida.' }, 401)
    }

    const SURL = Deno.env.get('SUPABASE_URL')!
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const sb = createClient(SURL, SERVICE)

    // Valida sessão
    const { data: sessao } = await sb
      .from('sessions')
      .select('usuario_id, token')
      .eq('token', session_token)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (!sessao) {
      return json(req, { error: 'Sessão expirada.' }, 401)
    }

    // Monta dados de atualização
    const updateData: Record<string, unknown> = {}
    if (nome) updateData.nome = nome

    // Validação + hash da nova senha
    if (password_new) {
      if (typeof password_new !== 'string' || password_new.length < 8) {
        return json(req, { error: 'Senha deve ter pelo menos 8 caracteres.' }, 400)
      }
      updateData.password_hash = await bcrypt.hash(password_new)
    }

    if (foto_url) updateData.foto_url = foto_url

    if (Object.keys(updateData).length === 0) {
      return json(req, { ok: true })
    }

    const { error } = await sb
      .from('usuarios')
      .update(updateData)
      .eq('id', sessao.usuario_id)

    if (error) {
      console.error('[update-profile] error:', JSON.stringify(error))
      return json(req, { error: errMsg(error) }, 500)
    }

    // Se a senha foi alterada, invalidar TODAS as outras sessões do usuário
    if (password_new) {
      await sb
        .from('sessions')
        .delete()
        .eq('usuario_id', sessao.usuario_id)
        .neq('token', session_token)
      console.log(`[update-profile] Other sessions invalidated for user: ${sessao.usuario_id}`)
    }

    return json(req, { ok: true })

  } catch (e) {
    console.error('[update-profile] catch:', e)
    return json(req, { error: errMsg(e) }, 500)
  }
})
