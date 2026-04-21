import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { handleCors, json } from "../_shared/cors.ts"
import { validateSession, isAdmin } from "../_shared/roles.ts"

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const {
      session_token,
      id,
      usuario_id,
      data_reuniao,
      titulo,
      pontos_fortes,
      pontos_melhoria,
      swot_forcas,
      swot_fraquezas,
      swot_oportunidades,
      swot_ameacas,
      objetivos_pessoais,
      apoio_ngp,
      combinados_proximo_ciclo,
      notas_livres,
      status,
      apresentado_em,
    } = await req.json()

    if (!session_token) return json(req, { error: 'Sessão inválida.' }, 401)
    if (!usuario_id) return json(req, { error: 'Colaborador é obrigatório.' }, 400)
    if (!data_reuniao) return json(req, { error: 'Data da reunião é obrigatória.' }, 400)

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const user = await validateSession(sb, session_token)

    if (!user) return json(req, { error: 'Sessão expirada.' }, 401)

    const { data: colaborador, error: colaboradorError } = await sb
      .from('usuarios')
      .select('id, gestor_usuario')
      .eq('id', usuario_id)
      .in('role', ['admin', 'ngp'])
      .single()

    if (colaboradorError || !colaborador) {
      console.error('[admin-carreira-upsert-reuniao] colaborador error:', colaboradorError)
      return json(req, { error: 'Colaborador não encontrado.' }, 404)
    }

    const isResponsibleManager =
      !!user.username &&
      !!colaborador.gestor_usuario &&
      user.username.trim().toLowerCase() === colaborador.gestor_usuario.trim().toLowerCase()

    if (!isAdmin(user.role) && !isResponsibleManager) {
      return json(req, { error: 'Acesso negado.' }, 403)
    }

    const payload = {
      usuario_id,
      data_reuniao,
      titulo: titulo?.trim() || null,
      pontos_fortes: pontos_fortes?.trim() || null,
      pontos_melhoria: pontos_melhoria?.trim() || null,
      swot_forcas: swot_forcas?.trim() || null,
      swot_fraquezas: swot_fraquezas?.trim() || null,
      swot_oportunidades: swot_oportunidades?.trim() || null,
      swot_ameacas: swot_ameacas?.trim() || null,
      objetivos_pessoais: objetivos_pessoais?.trim() || null,
      apoio_ngp: apoio_ngp?.trim() || null,
      combinados_proximo_ciclo: combinados_proximo_ciclo?.trim() || null,
      notas_livres: notas_livres?.trim() || null,
      status: status === 'publicado' ? 'publicado' : status === 'agendado' ? 'agendado' : 'anotado',
      apresentado_em: status === 'publicado' ? (apresentado_em || new Date().toISOString()) : null,
      updated_by: user.usuario_id,
      updated_at: new Date().toISOString(),
    }

    if (id) {
      const { data: reuniao, error } = await sb
        .from('carreira_reunioes')
        .update(payload)
        .eq('id', id)
        .select('id, usuario_id, data_reuniao, titulo, pontos_fortes, pontos_melhoria, swot_forcas, swot_fraquezas, swot_oportunidades, swot_ameacas, objetivos_pessoais, apoio_ngp, combinados_proximo_ciclo, notas_livres, status, apresentado_em, created_at, updated_at')
        .single()

      if (error) {
        console.error('[admin-carreira-upsert-reuniao] update error:', error)
        return json(req, { error: 'Erro ao atualizar reunião.' }, 500)
      }

      return json(req, { reuniao })
    }

    const { data: reuniao, error } = await sb
      .from('carreira_reunioes')
      .insert({
        ...payload,
        created_by: user.usuario_id,
      })
      .select('id, usuario_id, data_reuniao, titulo, pontos_fortes, pontos_melhoria, swot_forcas, swot_fraquezas, swot_oportunidades, swot_ameacas, objetivos_pessoais, apoio_ngp, combinados_proximo_ciclo, notas_livres, status, apresentado_em, created_at, updated_at')
      .single()

    if (error) {
      console.error('[admin-carreira-upsert-reuniao] insert error:', error)
      return json(req, { error: 'Erro ao salvar reunião.' }, 500)
    }

    return json(req, { reuniao })
  } catch (e) {
    console.error('[admin-carreira-upsert-reuniao] Error:', e)
    return json(req, { error: 'Erro interno.' }, 500)
  }
})
