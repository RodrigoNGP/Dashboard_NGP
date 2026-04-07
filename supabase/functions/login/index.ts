import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts"
import { handleCors, json } from "../_shared/cors.ts"

// ── Rate limiting: máx 5 tentativas por IP a cada 5 minutos ──────────────────
const attempts = new Map<string, { count: number; resetAt: number }>()
const MAX_ATTEMPTS = 5
const WINDOW_MS = 5 * 60 * 1000

function checkRate(ip: string): boolean {
  const now = Date.now()
  const e = attempts.get(ip)
  if (!e || now > e.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  e.count++
  return e.count <= MAX_ATTEMPTS
}

// Limpa entradas expiradas a cada 10 min para evitar memory leak
setInterval(() => {
  const now = Date.now()
  for (const [ip, e] of attempts) {
    if (now > e.resetAt) attempts.delete(ip)
  }
}, 10 * 60 * 1000)

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    // Rate limiting por IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || 'unknown'

    if (!checkRate(ip)) {
      return json(req, { error: 'Muitas tentativas. Aguarde 5 minutos.' }, 429)
    }

    const { username, password, role } = await req.json()

    if (!username || !password || !role) {
      return json(req, { error: 'Parâmetros inválidos.' }, 400)
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
      return json(req, { error: 'Usuário ou senha incorretos.' }, 401)
    }

    // ── Validar senha ────────────────────────────────────────────────────────
    // Suporta bcrypt (seguro) e plain text (legado) com migração automática
    let passwordValid = false
    const storedHash = usuario.password_hash || ''

    if (storedHash.startsWith('$2')) {
      // Hash bcrypt → comparação segura
      passwordValid = await bcrypt.compare(password, storedHash)
    } else {
      // Senha legada (plain text) → compara e migra para bcrypt
      passwordValid = storedHash === password
      if (passwordValid) {
        const newHash = await bcrypt.hash(password)
        await sb.from('usuarios').update({ password_hash: newHash }).eq('id', usuario.id)
        console.log(`[login] Password migrated to bcrypt: ${usuario.username}`)
      }
    }

    if (!passwordValid) {
      return json(req, { error: 'Usuário ou senha incorretos.' }, 401)
    }

    // Login OK → limpar rate limit desse IP
    attempts.delete(ip)

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
      return json(req, { error: 'Erro ao criar sessão.' }, 500)
    }

    return json(req, {
      session_token: sessionToken,
      user: {
        nome: usuario.nome,
        username: usuario.username,
        role: usuario.role,
        meta_account_id: usuario.meta_account_id || undefined,
        foto_url: usuario.foto_url || undefined,
      },
      expires_at: expiresAt,
    })

  } catch (e) {
    console.error('[login] Error:', e)
    return json(req, { error: 'Erro interno.' }, 500)
  }
})
