// @ts-nocheck
import { createClient } from 'supabase'
import { handleCors, json } from '../_shared/cors.ts'
import { applyPipelineScope, getScopedPipeline, resolveCrmScope } from '../_shared/crm.ts'

// ── Temperatura do lead (calculada server-side) ──────────────────────────────
// Retorna 'hot' | 'warm' | 'cold' baseado em:
//   - dias desde última atividade (last_activity_at)
//   - dias na etapa atual (stage_changed_at)
//   - se nunca teve atividade, usa created_at como fallback
function calcTemperature(lead: any): 'hot' | 'warm' | 'cold' {
  const now = Date.now()
  const MS_PER_DAY = 86_400_000

  const lastActRef = lead.last_activity_at
    ? new Date(lead.last_activity_at).getTime()
    : new Date(lead.created_at).getTime()
  const stageRef = lead.stage_changed_at
    ? new Date(lead.stage_changed_at).getTime()
    : new Date(lead.created_at).getTime()

  const daysSinceActivity = (now - lastActRef) / MS_PER_DAY
  const daysInStage       = (now - stageRef) / MS_PER_DAY

  // 🔴 Cold: sem atividade há mais de 7 dias OU preso na etapa há mais de 14 dias
  if (daysSinceActivity > 7 || daysInStage > 14) return 'cold'
  // 🟢 Hot: atividade recente (< 2 dias) E na etapa há menos de 7 dias
  if (daysSinceActivity < 2 && daysInStage < 7)  return 'hot'
  // 🟡 Warm: entre os dois
  return 'warm'
}

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

    const { user, clienteId } = scope

    // ── ACTIONS ──────────────────────────────────────────────────────────────

    // GET_FULL_DATA — Agregador de dados para o dashboard inicial (evita múltiplos cold starts)
    if (action === 'get_full_data') {
      const { pipeline_id } = params

      // 1. Busca todas as pipelines ativas
      let pipelinesQuery = sb
        .from('crm_pipelines')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true })

      pipelinesQuery = applyPipelineScope(pipelinesQuery, clienteId)

      const { data: pipelines, error: errPip } = await pipelinesQuery

      if (errPip) throw errPip

      // 2. Define qual pipeline focar (a pedida ou a primeira do array)
      const targetId = pipeline_id || (pipelines.length > 0 ? pipelines[0].id : null)

      let stagesList = []
      let leadsList  = []
      let fieldsList = []
      let tasksList  = []

      const timings: Record<string, number> = {}

      if (targetId) {
        const allowedPipeline = await getScopedPipeline(sb, targetId, clienteId)
        if (!allowedPipeline) return json(req, { error: 'Pipeline não encontrado.' }, 404)

        // 3. Busca paralela de dados vinculados — tasks escopadas ao pipeline ativo via inner join
        const t0 = Date.now()
        const [resStages, resLeads, resFields, resTasks] = await Promise.all([
          (async () => { const s = Date.now(); const r = await sb.from('crm_pipeline_stages').select('*').eq('pipeline_id', targetId).order('position', { ascending: true }); timings.stages_ms = Date.now() - s; return r })(),
          (async () => { const s = Date.now(); const r = await sb.from('crm_leads').select('*').eq('pipeline_id', targetId).order('position', { ascending: true }); timings.leads_ms = Date.now() - s; return r })(),
          (async () => { const s = Date.now(); const r = await sb.from('crm_pipeline_fields').select('*').eq('pipeline_id', targetId).order('position', { ascending: true }); timings.fields_ms = Date.now() - s; return r })(),
          (async () => {
            const s = Date.now()
            const r = await sb.from('crm_tasks')
              .select('*, lead:crm_leads!inner(company_name, stage_id, pipeline_id)')
              .eq('status', 'pendente')
              .eq('lead.pipeline_id', targetId)
              .order('due_date', { ascending: true })
              .limit(500)
            timings.tasks_ms = Date.now() - s
            return r
          })(),
        ])
        timings.parallel_total_ms = Date.now() - t0

        if (resStages.error) throw resStages.error
        if (resLeads.error)  throw resLeads.error
        if (resFields.error) throw resFields.error

        stagesList = resStages.data || []

        // Calcula temperatura para cada lead server-side (sem custo de AI)
        leadsList = (resLeads.data || []).map(lead => ({
          ...lead,
          temperature: calcTemperature(lead),
        }))

        fieldsList = resFields.data || []
        tasksList  = (resTasks.data || []).map(t => ({
          ...t,
          lead_company_name: t.lead?.company_name,
          lead_stage_id: t.lead?.stage_id
        }))
      }

      return json(req, {
        pipelines,
        active_pipeline_id: targetId,
        stages: stagesList,
        leads: leadsList,
        fields: fieldsList,
        tasks: tasksList,
        _timings: timings,
      })
    }

    if (action === 'list') {
      let query = sb
        .from('crm_pipelines')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true })

      query = applyPipelineScope(query, clienteId)

      const { data, error } = await query
      if (error) throw error
      return json(req, { pipelines: data || [] })
    }

    // CREATE — criar novo funil com etapas default
    if (action === 'create') {
      const { name, description } = params
      if (!name?.trim()) return json(req, { error: 'Nome obrigatório.' }, 400)

      const { data: pipeline, error: errP } = await sb
        .from('crm_pipelines')
        .insert({
          name: name.trim(),
          description: description?.trim() || null,
          cliente_id: clienteId,
        })
        .select()
        .single()

      if (errP) throw errP

      const defaultStages = [
        { name: 'Prospecção',   position: 0, color: '#9ca3af' },
        { name: 'Qualificação', position: 1, color: '#60a5fa' },
        { name: 'Reunião',      position: 2, color: '#facc15' },
        { name: 'Proposta',     position: 3, color: '#fb923c' },
        { name: 'Fechamento',   position: 4, color: '#4ade80' },
      ]

      const { data: stages, error: errS } = await sb
        .from('crm_pipeline_stages')
        .insert(defaultStages.map(s => ({ ...s, pipeline_id: pipeline.id })))
        .select()

      if (errS) throw errS
      return json(req, { pipeline, stages })
    }

    // RENAME — renomear funil
    if (action === 'rename') {
      const { pipeline_id, name } = params
      if (!pipeline_id) return json(req, { error: 'pipeline_id obrigatório.' }, 400)
      if (!name?.trim()) return json(req, { error: 'Nome obrigatório.' }, 400)

      const allowedPipeline = await getScopedPipeline(sb, pipeline_id, clienteId)
      if (!allowedPipeline) return json(req, { error: 'Pipeline não encontrado.' }, 404)

      const { data, error } = await sb
        .from('crm_pipelines')
        .update({ name: name.trim() })
        .eq('id', pipeline_id)
        .select()
        .single()

      if (error) throw error
      return json(req, { pipeline: data })
    }

    // DELETE — excluir funil (bloqueia se tiver leads)
    if (action === 'delete') {
      const { pipeline_id } = params
      if (!pipeline_id) return json(req, { error: 'pipeline_id obrigatório.' }, 400)

      const allowedPipeline = await getScopedPipeline(sb, pipeline_id, clienteId)
      if (!allowedPipeline) return json(req, { error: 'Pipeline não encontrado.' }, 404)

      const { count } = await sb
        .from('crm_leads')
        .select('*', { count: 'exact', head: true })
        .eq('pipeline_id', pipeline_id)

      if (count && count > 0) {
        return json(req, {
          error: `Não é possível excluir: este funil possui ${count} lead(s). Mova ou exclua os leads primeiro.`,
          leads_count: count,
        }, 409)
      }

      const { error } = await sb
        .from('crm_pipelines')
        .delete()
        .eq('id', pipeline_id)

      if (error) throw error
      return json(req, { ok: true })
    }

    return json(req, { error: `Action '${action}' desconhecida.` }, 400)

  } catch (e) {
    console.error('[crm-manage-pipeline]', e)
    return json(req, { error: 'Erro interno.' }, 500)
  }
})
