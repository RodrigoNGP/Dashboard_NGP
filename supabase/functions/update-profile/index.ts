import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, json } from "../_shared/cors.ts"

const PBKDF2_ITERATIONS = 100_000

const errMsg = (e: unknown): string => {
  if (!e) return 'Erro desconhecido'
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  const obj = e as Record<string, unknown>
  return String(obj.message || obj.details || obj.hint || obj.code || JSON.stringify(e))
}

async function hashPassword(password: string, salt?: Uint8Array): Promise<string> {
  if (!salt) salt = crypto.getRandomValues(new Uint8Array(16))
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

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [, saltHex, expectedHash] = stored.split(':')
  if (!saltHex || !expectedHash) return false
  const bytes = saltHex.match(/.{2}/g)?.map((b) => parseInt(b, 16)) || []
  const salt = new Uint8Array(bytes)
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key, 256
  )
  const hashHex = Array.from(new Uint8Array(derived)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return hashHex === expectedHash
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const { session_token, nome, password_current, password_new, foto_url } = await req.json()

    if (!session_token) {
      return json(req, { error: 'Sessão inválida.' }, 401)
    }

    const SURL = Deno.env.get('SUPABASE_URL')!
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const sb = createClient(SURL, SERVICE)

    const { data: sessao } = await sb
      .from('sessions')
      .select('usuario_id, token')
      .eq('token', session_token)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (!sessao) {
      return json(req, { error: 'Sessão expirada.' }, 401)
    }

    const { data: usuario } = await sb
      .from('usuarios')
      .select('id, password_hash')
      .eq('id', sessao.usuario_id)
      .single()

    if (!usuario) {
      return json(req, { error: 'Usuário não encontrado.' }, 404)
    }

    const updateData: Record<string, unknown> = {}
    if (nome) updateData.nome = nome
    if (foto_url) updateData.foto_url = foto_url

    if (password_new) {
      if (!password_current || typeof password_current !== 'string') {
        return json(req, { error: 'Senha atual incorreta' }, 400)
      }

      if (typeof password_new !== 'string' || password_new.length < 6) {
        return json(req, { error: 'Senha deve ter pelo menos 6 caracteres.' }, 400)
      }

      const storedHash = usuario.password_hash || ''
      let passwordValid = false

      if (storedHash.startsWith('pbkdf2:')) {
        passwordValid = await verifyPassword(password_current, storedHash)
      } else if (storedHash.startsWith('sha256:')) {
        const data = new TextEncoder().encode(password_current)
        const digest = await crypto.subtle.digest('SHA-256', data)
        const hashed = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
        passwordValid = storedHash === `sha256:${hashed}`
      } else {
        passwordValid = storedHash === password_current
      }

      if (!passwordValid) {
        return json(req, { error: 'Senha atual incorreta' }, 401)
      }

      updateData.password_hash = await hashPassword(password_new)
    }

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
