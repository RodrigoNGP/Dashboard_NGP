import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { handleCors, json } from "../_shared/cors.ts"
import { validateSession, isAdmin, isNgp } from "../_shared/roles.ts"
import {
  getMonthRangeUtc,
  getWeekRangeUtc,
  isOfficialEmailLogin,
  sumWorkedMinutesByUser,
} from "../_shared/carreira.ts"

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const { session_token } = await req.json()
    if (!session_token) return json(req, { error: 'Sessão inválida.' }, 401)

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const user = await validateSession(sb, session_token)

    if (!user) return json(req, { error: 'Sessão expirada.' }, 401)
    if (!isNgp(user.role)) return json(req, { error: 'Acesso negado.' }, 403)

    const { data: usuarios, error: usuariosError } = await sb
      .from('usuarios')
      .select('id, nome, username, email, role, ativo, foto_url, cargo, funcao, senioridade, gestor_usuario, objetivo_profissional_resumo, setor, data_entrada')
      .in('role', ['admin', 'ngp'])
      .eq('ativo', true)
      .order('nome', { ascending: true })

    if (usuariosError) {
      console.error('[admin-carreira-dashboard] usuarios error:', usuariosError)
      return json(req, { error: 'Erro ao buscar colaboradores.' }, 500)
    }

    const baseColaboradores = (usuarios || []).filter((usuario) => isOfficialEmailLogin(usuario.username))
    const colaboradores = isAdmin(user.role)
      ? baseColaboradores
      : baseColaboradores.filter((usuario) =>
          !!usuario.gestor_usuario &&
          !!user.username &&
          usuario.gestor_usuario.trim().toLowerCase() === user.username.trim().toLowerCase()
        )
    const userIds = colaboradores.map((usuario) => usuario.id)

    const { startUtc: weekStartUtc, endUtc: weekEndUtc } = getWeekRangeUtc()
    const { startUtc: monthStartUtc, endUtc: monthEndUtc } = getMonthRangeUtc()

    let weekTotals: Record<string, number> = {}
    let monthTotals: Record<string, number> = {}

    if (userIds.length > 0) {
      const [{ data: weekRecords, error: weekError }, { data: monthRecords, error: monthError }] = await Promise.all([
        sb
          .from('ponto_registros')
          .select('usuario_id, tipo_registro, created_at')
          .in('usuario_id', userIds)
          .is('deleted_at', null)
          .gte('created_at', weekStartUtc)
          .lt('created_at', weekEndUtc),
        sb
          .from('ponto_registros')
          .select('usuario_id, tipo_registro, created_at')
          .in('usuario_id', userIds)
          .is('deleted_at', null)
          .gte('created_at', monthStartUtc)
          .lt('created_at', monthEndUtc),
      ])

      if (weekError || monthError) {
        console.error('[admin-carreira-dashboard] ponto error:', weekError || monthError)
        return json(req, { error: 'Erro ao calcular horas trabalhadas.' }, 500)
      }

      weekTotals = sumWorkedMinutesByUser(weekRecords || [])
      monthTotals = sumWorkedMinutesByUser(monthRecords || [])
    }

    const funcaoMap: Record<string, number> = {}
    const cargoMap: Record<string, number> = {}
    const senioridadeMap: Record<string, number> = {}

    for (const colaborador of colaboradores) {
      const funcao = colaborador.funcao?.trim() || 'Sem função'
      const cargo = colaborador.cargo?.trim() || 'Sem cargo'
      const senioridade = colaborador.senioridade?.trim() || 'Sem senioridade'
      funcaoMap[funcao] = (funcaoMap[funcao] || 0) + 1
      cargoMap[cargo] = (cargoMap[cargo] || 0) + 1
      senioridadeMap[senioridade] = (senioridadeMap[senioridade] || 0) + 1
    }

    const colaboradoresComHoras = colaboradores.map((colaborador) => ({
      ...colaborador,
      horas_semana_mins: weekTotals[colaborador.id] || 0,
      horas_mes_mins: monthTotals[colaborador.id] || 0,
    }))

    const totalHorasSemana = colaboradoresComHoras.reduce((acc, item) => acc + item.horas_semana_mins, 0)
    const totalHorasMes = colaboradoresComHoras.reduce((acc, item) => acc + item.horas_mes_mins, 0)

    return json(req, {
      cards: {
        total_colaboradores: colaboradoresComHoras.length,
        total_horas_semana_mins: totalHorasSemana,
        total_horas_mes_mins: totalHorasMes,
        total_funcoes: Object.keys(funcaoMap).filter((label) => label !== 'Sem função').length,
      },
      distribuicoes: {
        por_funcao: Object.entries(funcaoMap).map(([label, count]) => ({ label, count })),
        por_cargo: Object.entries(cargoMap).map(([label, count]) => ({ label, count })),
        por_senioridade: Object.entries(senioridadeMap).map(([label, count]) => ({ label, count })),
      },
      colaboradores: colaboradoresComHoras,
    })
  } catch (e) {
    console.error('[admin-carreira-dashboard] Error:', e)
    return json(req, { error: 'Erro interno.' }, 500)
  }
})
