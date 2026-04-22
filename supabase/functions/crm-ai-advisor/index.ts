// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getScopedLead, getScopedPipeline, resolveCrmScope } from '../_shared/crm.ts'

const CACHE_HOURS = 24
const MAX_OUTPUT_TOKENS = 600
const OPENAI_TIMEOUT_MS = 30_000

function corsHeaders(req) {
  const origin = req.headers.get('origin') || ''
  const list = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean)
  if (list.length > 0) {
    return {
      'Access-Control-Allow-Origin': list.includes(origin) ? origin : '',
      'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
    }
  }
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function handleCors(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) })
  return null
}

function json(req, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

function extractOpenAiText(data) {
  if (typeof data?.output_text === 'string') return data.output_text
  const parts = []
  for (const item of data?.output || []) {
    for (const c of item?.content || []) {
      if (c?.type === 'output_text' && c?.text) parts.push(c.text)
      else if (typeof c?.text === 'string') parts.push(c.text)
    }
  }
  return parts.join('\n').trim()
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const { session_token, action = 'advise', ...params } = await req.json()
    if (!session_token) return json(req, { error: 'Sessao invalida.' }, 401)

    const sb = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    const scope = await resolveCrmScope(sb, session_token, params.cliente_id)
    if (!scope) return json(req, { error: 'Sessao expirada.' }, 401)

    const { user: usuario, clienteId } = scope

    // ACTION: STAGNATION
    if (action === 'stagnation') {
      const { pipeline_id, days_threshold = 7 } = params
      if (!pipeline_id) return json(req, { error: 'pipeline_id obrigatorio.' }, 400)
      const pipeline = await getScopedPipeline(sb, pipeline_id, clienteId)
      if (!pipeline) return json(req, { error: 'Pipeline nao encontrado.' }, 404)
      const threshold = new Date(Date.now() - days_threshold * 86_400_000).toISOString()
      const { data: stagnant, error } = await sb
        .from('crm_leads')
        .select('id, company_name, contact_name, stage_id, last_activity_at, stage_changed_at, created_at, estimated_value')
        .eq('pipeline_id', pipeline_id)
        .eq('status', 'active')
        .or(`last_activity_at.is.null,last_activity_at.lt.${threshold}`)
        .order('last_activity_at', { ascending: true, nullsFirst: true })
      if (error) throw error
      return json(req, { stagnant: stagnant || [] })
    }

    // ACTION: ADVISE
    if (action !== 'advise') return json(req, { error: `Action '${action}' desconhecida.` }, 400)

    const { lead_id, force_refresh = false } = params
    if (!lead_id) return json(req, { error: 'lead_id obrigatorio.' }, 400)

    const scopedLead = await getScopedLead(sb, lead_id, clienteId)
    if (!scopedLead) return json(req, { error: 'Lead nao encontrado.' }, 404)

    const openAiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openAiKey) return json(req, { error: 'IA nao configurada. Configure OPENAI_API_KEY nos Supabase Secrets.' }, 500)

    if (!force_refresh) {
      const cacheThreshold = new Date(Date.now() - CACHE_HOURS * 3_600_000).toISOString()
      const { data: cached } = await sb
        .from('crm_ai_advisor_runs')
        .select('id, output, created_at, stage_id')
        .eq('lead_id', lead_id)
        .gte('created_at', cacheThreshold)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cached) return json(req, { advice: cached.output, cached: true, run_id: cached.id, created_at: cached.created_at })
    }

    const { data: lead, error: leadErr } = await sb
      .from('crm_leads')
      .select('*, stage:crm_pipeline_stages!inner(name, pipeline_id)')
      .eq('id', lead_id)
      .single()
    if (leadErr || !lead) return json(req, { error: 'Lead nao encontrado.' }, 404)

    const { data: activities } = await sb
      .from('crm_activities')
      .select('activity_type, title, created_at, created_by_name')
      .eq('lead_id', lead_id)
      .order('created_at', { ascending: false })
      .limit(10)

    const { data: tasks } = await sb
      .from('crm_tasks')
      .select('title, status, due_date, priority')
      .eq('lead_id', lead_id)
      .eq('status', 'pendente')
      .order('due_date', { ascending: true })
      .limit(10)

    const now = new Date()
    const MS = 86_400_000
    const daysSinceAct = lead.last_activity_at ? Math.floor((now.getTime() - new Date(lead.last_activity_at).getTime()) / MS) : null
    const daysInStage  = lead.stage_changed_at  ? Math.floor((now.getTime() - new Date(lead.stage_changed_at).getTime())  / MS) : null

    // Tolerante: string (legado) ou array {text, created_at} (novo formato)
    const rawNote = (lead.stage_notes || {})[lead.stage_id]
    const stageNoteText = typeof rawNote === 'string'
      ? rawNote
      : Array.isArray(rawNote)
        ? rawNote.map(e => e.text).join('\n')
        : ''

    const timelineText = activities?.length
      ? activities.map(a => {
          const d = Math.floor((now.getTime() - new Date(a.created_at).getTime()) / MS)
          return `- [${d}d atras] ${a.activity_type.replace('_', ' ')}: "${a.title}" por ${a.created_by_name}`
        }).join('\n')
      : '(Nenhuma atividade registrada)'

    const tasksText = tasks?.length
      ? tasks.map(t => {
          const overdue = t.due_date && new Date(t.due_date) < now
          return `- ${t.title} (vence ${t.due_date || 'sem data'})${overdue ? ' ATRASADA' : ''}`
        }).join('\n')
      : '(Nenhuma tarefa pendente)'

    const prompt = `Empresa: ${lead.company_name}
Contato: ${lead.contact_name || 'N/A'}
Valor: R$ ${Number(lead.estimated_value || 0).toLocaleString('pt-BR')}
Etapa: ${lead.stage?.name || '?'} | Dias na etapa: ${daysInStage != null ? daysInStage : '?'} | Ultima atividade: ${daysSinceAct != null ? daysSinceAct + 'd atras' : 'nunca'}
Origem: ${lead.source || 'N/A'}

NOTAS DA ETAPA:
${stageNoteText || '(sem notas)'}

TIMELINE:
${timelineText}

TAREFAS:
${tasksText}

Com base nesses dados, me da um papo rapido sobre esse lead — como se voce fosse um colega de trabalho me contando o que ta acontecendo. Use linguagem simples e direta, sem termos tecnicos ou formalidade. Estrutura:

**O que ta rolando:** (1-2 linhas do estado atual, seja honesto se ta parado ou esfriando)
**O que fazer agora:** (1 acao concreta e simples, com sugestao de quando/como)
**Como abordar:** (1 angulo ou argumento que pode funcionar com esse cliente especifico)

Maximo 150 palavras. Fala como pessoa, nao como relatorio.`

    let aiRes
    try {
      aiRes = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.7,
          max_output_tokens: MAX_OUTPUT_TOKENS,
          input: [
            {
              role: 'system',
              content: [{ type: 'input_text', text: 'Voce e um colega de vendas experiente, nao um consultor formal. Fala de forma direta, descomplicada e humana — como se fosse uma conversa entre colegas. Sem jargao, sem rodeios, sem tom corporativo. Portugues brasileiro informal.' }],
            },
            {
              role: 'user',
              content: [{ type: 'input_text', text: prompt }],
            },
          ],
        }),
      })
    } catch {
      return json(req, { error: 'A IA demorou demais. Tente novamente.' }, 504)
    }

    const aiData = await aiRes.json().catch(() => ({}))
    if (!aiRes.ok) {
      const msg = aiData?.error?.message || `Erro ${aiRes.status} na IA.`
      return json(req, { error: msg }, aiRes.status >= 500 ? 502 : 400)
    }

    const advice = extractOpenAiText(aiData)
    if (!advice) return json(req, { error: 'A IA nao retornou sugestao. Tente novamente.' }, 502)

    const { data: run } = await sb
      .from('crm_ai_advisor_runs')
      .insert({ lead_id, stage_id: lead.stage_id, output: advice, created_by: usuario.id })
      .select('id, created_at')
      .single()

    return json(req, { advice, cached: false, run_id: run?.id, created_at: run?.created_at })

  } catch (e) {
    console.error('[crm-ai-advisor]', e)
    return json(req, { error: 'Erro interno.' }, 500)
  }
})
