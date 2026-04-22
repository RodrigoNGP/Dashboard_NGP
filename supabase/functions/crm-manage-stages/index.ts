// @ts-nocheck
import { createClient } from 'supabase'
import { handleCors, json } from '../_shared/cors.ts'
import { getScopedPipeline, getScopedStage, resolveCrmScope } from '../_shared/crm.ts'

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const { session_token, action, ...params } = await req.json()

    if (!session_token) return json(req, { error: 'Sessão inválida.' }, 401)
    if (!action)        return json(req, { error: 'Action obrigatória.' }, 400)

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const scope = await resolveCrmScope(sb, session_token, params.cliente_id)
    if (!scope) return json(req, { error: 'Sessão expirada.' }, 401)

    const { clienteId } = scope

    // ── ACTIONS ──────────────────────────────────────────────────────────────

    // LIST — listar etapas de um funil
    if (action === 'list') {
      const { pipeline_id } = params
      if (!pipeline_id) return json(req, { error: 'pipeline_id obrigatório.' }, 400)

      const pipeline = await getScopedPipeline(sb, pipeline_id, clienteId)
      if (!pipeline) return json(req, { error: 'Pipeline não encontrado.' }, 404)

      const { data, error } = await sb
        .from('crm_pipeline_stages')
        .select('*')
        .eq('pipeline_id', pipeline_id)
        .order('position', { ascending: true })

      if (error) throw error
      return json(req, { stages: data })
    }

    // CREATE — adicionar nova etapa ao funil
    if (action === 'create') {
      const { pipeline_id, name, color } = params
      if (!pipeline_id) return json(req, { error: 'pipeline_id obrigatório.' }, 400)
      if (!name?.trim()) return json(req, { error: 'Nome obrigatório.' }, 400)

      const pipeline = await getScopedPipeline(sb, pipeline_id, clienteId)
      if (!pipeline) return json(req, { error: 'Pipeline não encontrado.' }, 404)

      // Descobre a próxima posição
      const { data: existing } = await sb
        .from('crm_pipeline_stages')
        .select('position')
        .eq('pipeline_id', pipeline_id)
        .order('position', { ascending: false })
        .limit(1)

      const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0

      const { data, error } = await sb
        .from('crm_pipeline_stages')
        .insert({
          pipeline_id,
          name: name.trim(),
          position: nextPosition,
          color: color || '#9ca3af',
        })
        .select()
        .single()

      if (error) throw error
      return json(req, { stage: data })
    }

    // RENAME — renomear etapa
    if (action === 'rename') {
      const { stage_id, name } = params
      if (!stage_id)    return json(req, { error: 'stage_id obrigatório.' }, 400)
      if (!name?.trim()) return json(req, { error: 'Nome obrigatório.' }, 400)

      const stage = await getScopedStage(sb, stage_id, clienteId)
      if (!stage) return json(req, { error: 'Etapa não encontrada.' }, 404)

      const { data, error } = await sb
        .from('crm_pipeline_stages')
        .update({ name: name.trim() })
        .eq('id', stage_id)
        .select()
        .single()

      if (error) throw error
      return json(req, { stage: data })
    }

    // UPDATE_COLOR — mudar cor da etapa
    if (action === 'update_color') {
      const { stage_id, color } = params
      if (!stage_id) return json(req, { error: 'stage_id obrigatório.' }, 400)
      if (!color)    return json(req, { error: 'color obrigatório.' }, 400)

      const stage = await getScopedStage(sb, stage_id, clienteId)
      if (!stage) return json(req, { error: 'Etapa não encontrada.' }, 404)

      const { data, error } = await sb
        .from('crm_pipeline_stages')
        .update({ color })
        .eq('id', stage_id)
        .select()
        .single()

      if (error) throw error
      return json(req, { stage: data })
    }

    // REORDER — reordenar etapas (recebe array de IDs na nova ordem)
    if (action === 'reorder') {
      const { pipeline_id, ordered_ids } = params
      if (!pipeline_id)                return json(req, { error: 'pipeline_id obrigatório.' }, 400)
      if (!Array.isArray(ordered_ids)) return json(req, { error: 'ordered_ids deve ser um array.' }, 400)

      const pipeline = await getScopedPipeline(sb, pipeline_id, clienteId)
      if (!pipeline) return json(req, { error: 'Pipeline não encontrado.' }, 404)

      // Atualiza position de cada stage conforme índice no array
      const updates = ordered_ids.map((id: string, index: number) =>
        sb.from('crm_pipeline_stages')
          .update({ position: index })
          .eq('id', id)
          .eq('pipeline_id', pipeline_id)
      )

      await Promise.all(updates)
      return json(req, { ok: true })
    }

    // DELETE — excluir etapa (bloqueia se tiver leads)
    if (action === 'delete') {
      const { stage_id } = params
      if (!stage_id) return json(req, { error: 'stage_id obrigatório.' }, 400)

      const scopedStage = await getScopedStage(sb, stage_id, clienteId)
      if (!scopedStage) return json(req, { error: 'Etapa não encontrada.' }, 404)

      const { count } = await sb
        .from('crm_leads')
        .select('*', { count: 'exact', head: true })
        .eq('stage_id', stage_id)

      if (count && count > 0) {
        return json(req, {
          error: `Não é possível excluir: esta etapa possui ${count} lead(s). Mova os leads primeiro.`,
          leads_count: count,
        }, 409)
      }

      // Busca info da stage antes de deletar para reordenar as demais
      const stage = scopedStage

      const { error } = await sb
        .from('crm_pipeline_stages')
        .delete()
        .eq('id', stage_id)

      if (error) throw error

      // Reordena as stages restantes para fechar o gap
      if (stage) {
        const { data: remaining } = await sb
          .from('crm_pipeline_stages')
          .select('id')
          .eq('pipeline_id', stage.pipeline_id)
          .order('position', { ascending: true })

        if (remaining) {
          await Promise.all(
            remaining.map((s, index) =>
              sb.from('crm_pipeline_stages')
                .update({ position: index })
                .eq('id', s.id)
            )
          )
        }
      }

      return json(req, { ok: true })
    }

    return json(req, { error: `Action '${action}' desconhecida.` }, 400)

  } catch (e) {
    console.error('[crm-manage-stages]', e)
    return json(req, { error: 'Erro interno.' }, 500)
  }
})
