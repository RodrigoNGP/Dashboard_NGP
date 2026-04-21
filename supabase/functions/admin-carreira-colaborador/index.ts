import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { handleCors, json } from "../_shared/cors.ts"
import { validateSession, isAdmin } from "../_shared/roles.ts"
import { getMonthRangeUtc, getWeekRangeUtc, isOfficialEmailLogin, sumWorkedMinutesByUser } from "../_shared/carreira.ts"

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const { session_token, usuario_id } = await req.json()
    if (!session_token) return json(req, { error: 'Sessão inválida.' }, 401)
    if (!usuario_id) return json(req, { error: 'Usuário é obrigatório.' }, 400)

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const user = await validateSession(sb, session_token)

    if (!user) return json(req, { error: 'Sessão expirada.' }, 401)

    const { data: colaborador, error: colaboradorError } = await sb
      .from('usuarios')
      .select('id, nome, username, email, role, ativo, foto_url, cargo, funcao, senioridade, gestor_usuario, objetivo_profissional_resumo, setor, data_entrada')
      .eq('id', usuario_id)
      .in('role', ['admin', 'ngp'])
      .single()

    if (colaboradorError || !colaborador) {
      console.error('[admin-carreira-colaborador] colaborador error:', colaboradorError)
      return json(req, { error: 'Colaborador não encontrado.' }, 404)
    }

    if (!isOfficialEmailLogin(colaborador.username)) {
      return json(req, { error: 'Colaborador inválido para o módulo de carreira.' }, 400)
    }

    const isResponsibleManager =
      !!user.username &&
      !!colaborador.gestor_usuario &&
      user.username.trim().toLowerCase() === colaborador.gestor_usuario.trim().toLowerCase()
    const isOwnPublishedView = user.usuario_id === usuario_id
    const canViewPrivate = isAdmin(user.role) || isResponsibleManager

    if (!canViewPrivate && !isOwnPublishedView) {
      return json(req, { error: 'Acesso negado.' }, 403)
    }

    const { startUtc: weekStartUtc, endUtc: weekEndUtc } = getWeekRangeUtc()
    const { startUtc: monthStartUtc, endUtc: monthEndUtc } = getMonthRangeUtc()

    const [{ data: weekRecords, error: weekError }, { data: monthRecords, error: monthError }, { data: reunioes, error: reunioesError }] = await Promise.all([
      sb
        .from('ponto_registros')
        .select('usuario_id, tipo_registro, created_at')
        .eq('usuario_id', usuario_id)
        .is('deleted_at', null)
        .gte('created_at', weekStartUtc)
        .lt('created_at', weekEndUtc),
      sb
        .from('ponto_registros')
        .select('usuario_id, tipo_registro, created_at')
        .eq('usuario_id', usuario_id)
        .is('deleted_at', null)
        .gte('created_at', monthStartUtc)
        .lt('created_at', monthEndUtc),
      (() => {
        let query = sb
          .from('carreira_reunioes')
          .select('id, usuario_id, data_reuniao, titulo, pontos_fortes, pontos_melhoria, swot_forcas, swot_fraquezas, swot_oportunidades, swot_ameacas, objetivos_pessoais, apoio_ngp, combinados_proximo_ciclo, notas_livres, status, apresentado_em, created_at, updated_at')
          .eq('usuario_id', usuario_id)

        if (!canViewPrivate && isOwnPublishedView) {
          query = query.eq('status', 'publicado')
        }

        return query
          .order('status', { ascending: true })
          .order('data_reuniao', { ascending: false })
          .order('created_at', { ascending: false })
      })(),
    ])

    if (weekError || monthError || reunioesError) {
      console.error('[admin-carreira-colaborador] related error:', weekError || monthError || reunioesError)
      return json(req, { error: 'Erro ao carregar perfil de carreira.' }, 500)
    }

    const weekTotals = sumWorkedMinutesByUser(weekRecords || [])
    const monthTotals = sumWorkedMinutesByUser(monthRecords || [])

    return json(req, {
      colaborador,
      horas_semana_mins: weekTotals[usuario_id] || 0,
      horas_mes_mins: monthTotals[usuario_id] || 0,
      reunioes: reunioes || [],
    })
  } catch (e) {
    console.error('[admin-carreira-colaborador] Error:', e)
    return json(req, { error: 'Erro interno.' }, 500)
  }
})
