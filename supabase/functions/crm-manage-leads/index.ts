// @ts-nocheck
import { serve } from 'std/http/server'
import { createClient } from 'supabase'
import { handleCors, json } from '../_shared/cors.ts'
import { getScopedLead, getScopedPipeline, getScopedStage, resolveCrmScope } from '../_shared/crm.ts'

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const { session_token, action, ...params } = await req.json()

    if (!session_token) return json(req, { error: 'Sessão inválida.' }, 401)
    if (!action)        return json(req, { error: 'Action obrigatória.' }, 400)

    // Helper: log atividade automaticamente na timeline
    async function logActivity(sb: any, leadId: string, actType: string, title: string, metadata: any, userId: string, userName: string) {
      try {
        await sb.from('crm_activities').insert({
          lead_id: leadId,
          activity_type: actType,
          title,
          metadata: metadata || {},
          created_by: userId,
          created_by_name: userName,
        })
      } catch (e) {
        console.error('[crm-manage-leads:logActivity]', e)
      }
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const scope = await resolveCrmScope(sb, session_token, params.cliente_id)
    if (!scope) return json(req, { error: 'Sessão expirada.' }, 401)

    const { user: usuario, clienteId } = scope
    const sessao = { usuario_id: usuario.id }

    // ── ACTIONS ──────────────────────────────────────────────────────────────

    // LIST — listar leads de um funil
    if (action === 'list') {
      const { pipeline_id } = params
      if (!pipeline_id) return json(req, { error: 'pipeline_id obrigatório.' }, 400)

      const pipeline = await getScopedPipeline(sb, pipeline_id, clienteId)
      if (!pipeline) return json(req, { error: 'Pipeline não encontrado.' }, 404)

      const { data, error } = await sb
        .from('crm_leads')
        .select('*')
        .eq('pipeline_id', pipeline_id)
        .order('stage_id', { ascending: true })
        .order('position', { ascending: true })

      if (error) throw error
      return json(req, { leads: data })
    }

    // CREATE — criar novo lead
    if (action === 'create') {
      const { pipeline_id, stage_id, company_name, contact_name, email, phone, estimated_value, notes, source, custom_data } = params
      if (!pipeline_id)    return json(req, { error: 'pipeline_id obrigatório.' }, 400)
      if (!stage_id)       return json(req, { error: 'stage_id obrigatório.' }, 400)
      if (!company_name?.trim()) return json(req, { error: 'company_name obrigatório.' }, 400)

      const pipeline = await getScopedPipeline(sb, pipeline_id, clienteId)
      if (!pipeline) return json(req, { error: 'Pipeline não encontrado.' }, 404)

      const stage = await getScopedStage(sb, stage_id, clienteId)
      if (!stage || stage.pipeline_id !== pipeline_id) return json(req, { error: 'Etapa inválida para este pipeline.' }, 400)

      // Abre espaço no topo (posição 0) em uma única query
      await sb.rpc('crm_shift_stage_positions', {
        p_stage_id: stage_id,
        p_threshold: 0,
        p_exclude_lead_id: null,
      })

      const { data, error } = await sb
        .from('crm_leads')
        .insert({
          pipeline_id,
          stage_id,
          company_name: company_name.trim(),
          contact_name: contact_name?.trim() || null,
          email:        email?.trim() || null,
          phone:        phone?.trim() || null,
          estimated_value: estimated_value || 0,
          notes:  notes?.trim() || null,
          source: source?.trim() || null,
          position: 0,
          custom_data: custom_data || {},
          stage_changed_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) throw error
      return json(req, { lead: data })
    }

    // UPDATE — editar campos do lead
    if (action === 'update') {
      const { lead_id, company_name, contact_name, email, phone, estimated_value, notes, source, status, custom_data, stage_notes } = params
      if (!lead_id) return json(req, { error: 'lead_id obrigatório.' }, 400)

      const lead = await getScopedLead(sb, lead_id, clienteId)
      if (!lead) return json(req, { error: 'Lead não encontrado.' }, 404)

      const updates: Record<string, unknown> = {}
      if (company_name  !== undefined) updates.company_name    = company_name?.trim() || null
      if (contact_name  !== undefined) updates.contact_name    = contact_name?.trim() || null
      if (email         !== undefined) updates.email           = email?.trim() || null
      if (phone         !== undefined) updates.phone           = phone?.trim() || null
      if (estimated_value !== undefined) updates.estimated_value = estimated_value
      if (notes         !== undefined) updates.notes           = notes?.trim() || null
      if (source        !== undefined) updates.source          = source?.trim() || null
      if (status        !== undefined) updates.status          = status
      if (custom_data   !== undefined) updates.custom_data     = custom_data
      if (stage_notes   !== undefined) updates.stage_notes     = stage_notes

      const { data, error } = await sb
        .from('crm_leads')
        .update(updates)
        .eq('id', lead_id)
        .select()
        .single()

      if (error) throw error
      return json(req, { lead: data })
    }

    // MOVE — mover lead entre etapas (drag-and-drop)
    if (action === 'move') {
      const { lead_id, new_stage_id, new_position } = params
      if (!lead_id)      return json(req, { error: 'lead_id obrigatório.' }, 400)
      if (!new_stage_id) return json(req, { error: 'new_stage_id obrigatório.' }, 400)
      if (new_position === undefined) return json(req, { error: 'new_position obrigatório.' }, 400)

      const scopedLead = await getScopedLead(sb, lead_id, clienteId)
      if (!scopedLead) return json(req, { error: 'Lead não encontrado.' }, 404)

      const scopedStage = await getScopedStage(sb, new_stage_id, clienteId)
      if (!scopedStage) return json(req, { error: 'Etapa de destino não encontrada.' }, 404)
      if (scopedStage.pipeline_id !== scopedLead.pipeline_id) {
        return json(req, { error: 'A etapa de destino precisa pertencer ao mesmo pipeline.' }, 400)
      }

      // Busca stage atual do lead
      const lead = {
        stage_id: scopedLead.stage_id,
        position: scopedLead.position,
      }

      if (!lead) return json(req, { error: 'Lead não encontrado.' }, 404)

      const oldStageId  = lead.stage_id
      const oldPosition = lead.position

      // Reposicionamento em batch via RPC (elimina N+1)
      if (oldStageId !== new_stage_id) {
        // 1) compacta o stage de origem (fecha o gap deixado pelo lead que saiu)
        await sb.rpc('crm_compact_stage_positions', {
          p_stage_id: oldStageId,
          p_exclude_lead_id: lead_id,
        })
        // 2) abre espaço no stage de destino a partir de new_position
        await sb.rpc('crm_shift_stage_positions', {
          p_stage_id: new_stage_id,
          p_threshold: new_position,
          p_exclude_lead_id: lead_id,
        })
      } else {
        // Mesmo stage: compacta e depois abre espaço no destino
        await sb.rpc('crm_compact_stage_positions', {
          p_stage_id: oldStageId,
          p_exclude_lead_id: lead_id,
        })
        await sb.rpc('crm_shift_stage_positions', {
          p_stage_id: oldStageId,
          p_threshold: new_position,
          p_exclude_lead_id: lead_id,
        })
      }

      // Prepara updates — stage_changed_at só muda se trocou de etapa
      const moveUpdates: Record<string, unknown> = {
        stage_id: new_stage_id,
        position: new_position,
      }
      if (oldStageId !== new_stage_id) {
        moveUpdates.stage_changed_at = new Date().toISOString()
      }

      // Atualiza o lead com novo stage e posição
      const { data, error } = await sb
        .from('crm_leads')
        .update(moveUpdates)
        .eq('id', lead_id)
        .select()
        .single()

      if (error) throw error

      // Log automático de mudança de etapa na timeline
      if (oldStageId !== new_stage_id) {
        const [oldStageRes, newStageRes] = await Promise.all([
          sb.from('crm_pipeline_stages').select('name').eq('id', oldStageId).single(),
          sb.from('crm_pipeline_stages').select('name').eq('id', new_stage_id).single(),
        ])
        const fromName = oldStageRes.data?.name || 'Desconhecida'
        const toName   = newStageRes.data?.name || 'Desconhecida'
        await logActivity(
          sb, lead_id, 'mudanca_etapa',
          `Movido de "${fromName}" para "${toName}"`,
          { from_stage: fromName, to_stage: toName, from_stage_id: oldStageId, to_stage_id: new_stage_id },
          sessao.usuario_id, usuario.nome || 'Usuário'
        )
      }

      return json(req, { lead: data, ok: true })
    }

    // DELETE — excluir lead
    if (action === 'delete') {
      const { lead_id } = params
      if (!lead_id) return json(req, { error: 'lead_id obrigatório.' }, 400)

      const scopedLead = await getScopedLead(sb, lead_id, clienteId)
      if (!scopedLead) return json(req, { error: 'Lead não encontrado.' }, 404)

      // Busca stage para reordenar após delete
      const lead = {
        stage_id: scopedLead.stage_id,
        position: scopedLead.position,
      }

      const { error } = await sb
        .from('crm_leads')
        .delete()
        .eq('id', lead_id)

      if (error) throw error

      // Compacta posições no stage em uma única query
      if (lead) {
        await sb.rpc('crm_compact_stage_positions', {
          p_stage_id: lead.stage_id,
          p_exclude_lead_id: null,
        })
      }

      return json(req, { ok: true })
    }

    return json(req, { error: `Action '${action}' desconhecida.` }, 400)

  } catch (e) {
    console.error('[crm-manage-leads]', e)
    return json(req, { error: 'Erro interno.' }, 500)
  }
})
