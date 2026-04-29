import { serve } from "std/http/server"
import { createClient } from "supabase"
import { handleCors, json } from "../_shared/cors.ts"
import { lastDayOfMonth, normalizeDateOnly, normalizeText, parseCurrencyInput } from "../_shared/financeiro.ts"
import { validateSession } from "../_shared/roles.ts"

async function checkFinanceiroAccess(sb: any, usuario_id: string): Promise<boolean> {
  const { data } = await sb.from('usuarios').select('acesso_financeiro, ativo').eq('id', usuario_id).single()
  return !!data?.acesso_financeiro && !!data?.ativo
}

function normalizeKey(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function normalizeSearchText(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function isInternalTransferTransaction(tx: any): boolean {
  const combined = [
    tx?.descricao,
    tx?.observacoes,
    tx?.categoria?.nome,
  ].map(normalizeSearchText).join(' ')

  return (
    combined.includes('transfer') ||
    combined.includes('movimentacao entre contas') ||
    combined.includes('movimentacao interna') ||
    combined.includes('entre contas')
  )
}

function parseImportDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw) return null
  const iso = normalizeDateOnly(raw)
  if (iso) return iso
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return null
  return `${match[3]}-${match[2]}-${match[1]}`
}

async function ensureCategoria(sb: any, nome: string, tipo: 'entrada' | 'saida') {
  const normalizedNome = normalizeText(nome)
  if (!normalizedNome) return null
  const existing = await sb.from('fin_categorias')
    .select('id,nome,tipo')
    .eq('ativo', true)
    .eq('nome', normalizedNome)
    .eq('tipo', tipo)
    .maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data?.id) return existing.data.id

  const insert = await sb.from('fin_categorias')
    .insert({ nome: normalizedNome, tipo, cor: tipo === 'entrada' ? '#059669' : '#dc2626' })
    .select('id')
    .single()
  if (insert.error) throw insert.error
  return insert.data.id
}

async function ensureCostCenter(sb: any, nome: string) {
  const normalizedNome = normalizeText(nome)
  if (!normalizedNome) return null
  const existing = await sb.from('fin_cost_centers')
    .select('id,nome')
    .eq('ativo', true)
    .eq('nome', normalizedNome)
    .maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data?.id) return existing.data.id

  const insert = await sb.from('fin_cost_centers')
    .insert({ nome: normalizedNome })
    .select('id')
    .single()
  if (insert.error) throw insert.error
  return insert.data.id
}

async function ensureAccount(sb: any, nome: string) {
  const normalizedNome = normalizeText(nome)
  if (!normalizedNome) return null
  const existing = await sb.from('fin_accounts')
    .select('id,nome')
    .eq('ativo', true)
    .eq('nome', normalizedNome)
    .maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data?.id) return { id: existing.data.id, created: false, nome: existing.data.nome }

  const insert = await sb.from('fin_accounts')
    .insert({ nome: normalizedNome, tipo: 'banco', saldo_inicial: 0 })
    .select('id,nome')
    .single()
  if (insert.error) throw insert.error
  return { id: insert.data.id, created: true, nome: insert.data.nome }
}

async function ensureContato(sb: any, nome: string, tipo: 'entrada' | 'saida', userId: string) {
  const normalizedNome = normalizeText(nome)
  if (!normalizedNome) return { cliente_id: null, fornecedor_id: null }

  if (tipo === 'saida') {
    const existing = await sb.from('fin_fornecedores')
      .select('id,nome')
      .eq('ativo', true)
      .eq('nome', normalizedNome)
      .maybeSingle()
    if (existing.error) throw existing.error
    if (existing.data?.id) return { cliente_id: null, fornecedor_id: existing.data.id }

    const insert = await sb.from('fin_fornecedores')
      .insert({ nome: normalizedNome, created_by: userId })
      .select('id')
      .single()
    if (insert.error) throw insert.error
    return { cliente_id: null, fornecedor_id: insert.data.id }
  }

  const existing = await sb.from('fin_clientes')
    .select('id,nome')
    .eq('ativo', true)
    .eq('nome', normalizedNome)
    .maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data?.id) return { cliente_id: existing.data.id, fornecedor_id: null }

  const insert = await sb.from('fin_clientes')
    .insert({ nome: normalizedNome, created_by: userId })
    .select('id')
    .single()
  if (insert.error) throw insert.error
  return { cliente_id: insert.data.id, fornecedor_id: null }
}

function extractOpenAiText(data: any) {
  if (typeof data?.output_text === 'string') return data.output_text
  const parts: string[] = []
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && content?.text) parts.push(content.text)
      if (typeof content?.text === 'string') parts.push(content.text)
    }
  }
  return parts.join('\n').trim()
}

async function analyzeImportWithAi(rows: any[], accountName: string) {
  const openAiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openAiKey) return null

  const sample = rows.slice(0, 80).map((row, index) => ({
    linha: index + 2,
    tipo: row.tipo,
    descricao: row.descricao,
    categoria: row.categoria,
    contato: row.contato,
    valor: row.valor,
    status: row.status,
    competence_date: row.competence_date,
    payment_date: row.payment_date,
  }))

  const totals = rows.reduce((acc, row) => {
    if (row.tipo === 'entrada') acc.entradas += Number(row.valor || 0)
    else acc.saidas += Number(row.valor || 0)
    return acc
  }, { entradas: 0, saidas: 0 })

  const categoryCounts = Object.entries(rows.reduce((acc: Record<string, number>, row) => {
    const key = normalizeText(row.categoria) || 'Sem categoria'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 12)

  const prompt = {
    conta: accountName,
    total_linhas: rows.length,
    entradas: totals.entradas,
    saidas: totals.saidas,
    categorias_mais_frequentes: categoryCounts,
    amostra: sample,
  }

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      headline: { type: 'string' },
      summary: { type: 'string' },
      warnings: { type: 'array', items: { type: 'string' } },
      opportunities: { type: 'array', items: { type: 'string' } },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    },
    required: ['headline', 'summary', 'warnings', 'opportunities', 'confidence'],
  }

  const aiRes = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openAiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'text',
              text: 'Você analisa importações financeiras de CSV antes da gravação. Seja conservador. Alerte inconsistências, duplicidades prováveis, categorias estranhas, transferências suspeitas e padrões que mereçam revisão humana. Não invente fatos. Responda em português do Brasil.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: JSON.stringify(prompt),
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'finance_import_review',
          schema,
          strict: true,
        },
      },
      max_output_tokens: 700,
    }),
  })

  if (!aiRes.ok) return null
  const aiData = await aiRes.json()
  const raw = extractOpenAiText(aiData)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const body = await req.json()
    const { session_token, action, ...payload } = body
    if (!session_token) return json(req, { error: 'Sessão inválida.' }, 401)

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const user = await validateSession(sb, session_token)
    if (!user) return json(req, { error: 'Sessão expirada.' }, 401)
    if (!await checkFinanceiroAccess(sb, user.usuario_id)) return json(req, { error: 'Acesso não autorizado.' }, 403)

    // ── LISTAR ──────────────────────────────────────────────────────────────
    if (action === 'listar') {
      const { tipo, account_id, view = 'competencia', date_start, date_end } = payload
      const dateField = view === 'caixa' ? 'payment_date' : 'competence_date'

      let q = sb.from('fin_transacoes')
        .select([
          '*',
          'categoria:fin_categorias(id,nome,cor)',
          'cliente:fin_clientes(id,nome)',
          'fornecedor:fin_fornecedores(id,nome)',
          'account:fin_accounts(id,nome,tipo)',
          'cost_center:fin_cost_centers(id,nome)',
          'product:fin_products(id,nome,tipo)',
        ].join(','))
        .order(dateField, { ascending: false })

      if (!account_id) {
        const { data: inactiveAccounts } = await sb.from('fin_accounts').select('id').eq('ativo', false)
        const inactiveIds = (inactiveAccounts ?? []).map((a: any) => a.id)
        if (inactiveIds.length > 0) {
          q = q.not('account_id', 'in', `(${inactiveIds.join(',')})`)
        }
      }

      if (tipo) q = q.eq('tipo', tipo)
      if (account_id) q = q.eq('account_id', account_id)

      if (date_start && date_end) {
        if (view === 'caixa') {
          q = q.not('payment_date', 'is', null)
            .eq('status', 'confirmado')
            .gte('payment_date', date_start).lte('payment_date', date_end)
        } else {
          q = q.gte('competence_date', date_start).lte('competence_date', date_end)
        }
      }

      const { data, error } = await q
      if (error) return json(req, { error: 'Erro ao buscar transações.' }, 500)
      return json(req, { transacoes: data })
    }

    if (action === 'importar_csv') {
      const { account_id, rows } = payload as { account_id?: string; rows?: any[] }
      if (!Array.isArray(rows) || rows.length === 0) return json(req, { error: 'Nenhuma linha válida para importar.' }, 400)

      let fixedAccountId: string | null = null
      if (account_id) {
        const accountCheck = await sb.from('fin_accounts').select('id,nome').eq('id', account_id).eq('ativo', true).maybeSingle()
        if (accountCheck.error) return json(req, { error: 'Erro ao validar conta.' }, 500)
        if (!accountCheck.data?.id) return json(req, { error: 'Conta não encontrada.' }, 404)
        fixedAccountId = accountCheck.data.id
      }

      const categoriaCache = new Map<string, string | null>()
      const centroCache = new Map<string, string | null>()
      const contatoCache = new Map<string, { cliente_id: string | null; fornecedor_id: string | null }>()
      const accountCache = new Map<string, string | null>()
      const createdAccounts = new Set<string>()

      // Normaliza todas as linhas primeiro para poder carregar duplicatas em bulk
      type NormalizedRow = {
        tipo: 'entrada' | 'saida'
        descricao: string
        competence_date: string
        payment_date: string | null
        valor: number
        rowAccountName: string | null
        categoria: string | null
        cost_center: string | null
        contato: string | null
        status_raw: string
        due_date: string | null
        tags: string | null
        additional_info: string | null
        attachments: string | null
      }

      const normalizedRows: NormalizedRow[] = []
      let skipped = 0

      for (const row of rows) {
        const tipo: 'entrada' | 'saida' = row.tipo === 'saida' ? 'saida' : 'entrada'
        const descricao = normalizeText(row.descricao)
        const competence_date = parseImportDate(row.competence_date)
        const payment_date = parseImportDate(row.payment_date)
        const parsedValor = parseCurrencyInput(row.valor)
        const valor = parsedValor == null ? null : Math.abs(parsedValor)
        const rowAccountName = normalizeText(row.account_name)

        if (!descricao || !competence_date || valor == null || valor <= 0) {
          skipped += 1
          continue
        }
        if (!fixedAccountId && !rowAccountName) {
          skipped += 1
          continue
        }

        normalizedRows.push({
          tipo, descricao, competence_date, payment_date, valor,
          rowAccountName: rowAccountName || null,
          categoria: normalizeText(row.categoria) || null,
          cost_center: normalizeText(row.cost_center) || null,
          contato: normalizeText(row.contato) || null,
          status_raw: String(row.status || ''),
          due_date: row.due_date || null,
          tags: row.tags || null,
          additional_info: row.additional_info || null,
          attachments: row.attachments || null,
        })
      }

      // Resolve contas únicas em batch antes de verificar duplicatas
      const uniqueAccountNames = Array.from(new Set(
        normalizedRows.map(r => r.rowAccountName).filter(Boolean) as string[]
      ))
      for (const name of uniqueAccountNames) {
        const key = normalizeKey(name)
        if (!accountCache.has(key)) {
          const ensured = await ensureAccount(sb, name)
          accountCache.set(key, ensured?.id || null)
          if (ensured?.created && ensured.nome) createdAccounts.add(ensured.nome)
        }
      }

      // Carrega duplicatas existentes em bulk por conta para evitar 1 query por linha
      // Agrupa linhas por account_id resolvido
      type AccountGroup = { accountId: string; rows: NormalizedRow[] }
      const byAccount = new Map<string, NormalizedRow[]>()
      for (const row of normalizedRows) {
        const aid = fixedAccountId || accountCache.get(normalizeKey(row.rowAccountName!)) || null
        if (!aid) { skipped += 1; continue }
        if (!byAccount.has(aid)) byAccount.set(aid, [])
        byAccount.get(aid)!.push(row)
      }

      // Para cada conta, carrega chaves existentes de uma vez
      type DedupKey = string
      const existingKeys = new Set<DedupKey>()
      for (const [aid, accRows] of byAccount) {
        const minDate = accRows.reduce((m, r) => r.competence_date < m ? r.competence_date : m, accRows[0].competence_date)
        const maxDate = accRows.reduce((m, r) => r.competence_date > m ? r.competence_date : m, accRows[0].competence_date)
        const { data: existing } = await sb.from('fin_transacoes')
          .select('tipo,descricao,competence_date,valor')
          .eq('account_id', aid)
          .gte('competence_date', minDate)
          .lte('competence_date', maxDate)
        for (const e of existing || []) {
          existingKeys.add(`${aid}|${e.tipo}|${e.descricao}|${e.competence_date}|${Number(e.valor)}`)
        }
      }

      let imported = 0
      const toInsert: any[] = []

      for (const [aid, accRows] of byAccount) {
        for (const row of accRows) {
          const dupKey = `${aid}|${row.tipo}|${row.descricao}|${row.competence_date}|${row.valor}`
          if (existingKeys.has(dupKey)) { skipped += 1; continue }
          // marca para não inserir duplicata dentro do mesmo batch
          existingKeys.add(dupKey)

          const catKey = `${row.tipo}:${normalizeKey(row.categoria || '')}`
          if (row.categoria && !categoriaCache.has(catKey)) {
            categoriaCache.set(catKey, await ensureCategoria(sb, row.categoria, row.tipo))
          }
          const categoria_id = row.categoria ? (categoriaCache.get(catKey) || null) : null

          const centerKey = normalizeKey(row.cost_center || '')
          if (row.cost_center && !centroCache.has(centerKey)) {
            centroCache.set(centerKey, await ensureCostCenter(sb, row.cost_center))
          }
          const cost_center_id = row.cost_center ? (centroCache.get(centerKey) || null) : null

          const contactKey = `${row.tipo}:${normalizeKey(row.contato || '')}`
          if (row.contato && !contatoCache.has(contactKey)) {
            contatoCache.set(contactKey, await ensureContato(sb, row.contato, row.tipo, user.usuario_id))
          }
          const contato = row.contato ? contatoCache.get(contactKey) : null
          const cliente_id = contato?.cliente_id || null
          const fornecedor_id = contato?.fornecedor_id || null

          const status = row.status_raw === 'pendente' || !row.payment_date ? 'pendente' : 'confirmado'
          const observacoes = normalizeText([
            row.due_date ? `Vencimento: ${row.due_date}` : '',
            row.tags ? `Tags: ${row.tags}` : '',
            row.additional_info ? `Informações adicionais: ${row.additional_info}` : '',
            row.attachments ? `Anexos: ${row.attachments}` : '',
          ].filter(Boolean).join('\n'))

          toInsert.push({
            tipo: row.tipo,
            descricao: row.descricao,
            valor: row.valor,
            data_transacao: row.competence_date,
            competence_date: row.competence_date,
            payment_date: status === 'confirmado' ? row.payment_date || row.competence_date : null,
            categoria_id,
            cliente_id,
            fornecedor_id,
            account_id: aid,
            cost_center_id,
            status,
            observacoes,
            created_by: user.usuario_id,
          })
        }
      }

      // Insere em batches de 200 para não estourar limites do PostgREST
      const BATCH = 200
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const batch = toInsert.slice(i, i + BATCH)
        const ins = await sb.from('fin_transacoes').insert(batch)
        if (ins.error) return json(req, { error: `Erro ao importar lote ${Math.floor(i / BATCH) + 1}: ${ins.error.message}` }, 500)
        imported += batch.length
      }

      return json(req, { imported, skipped, created_accounts: Array.from(createdAccounts) })
    }

    if (action === 'analisar_importacao_csv') {
      const { account_id, rows } = payload as { account_id?: string; rows?: any[] }
      if (!Array.isArray(rows) || rows.length === 0) return json(req, { error: 'Nenhuma linha válida para analisar.' }, 400)

      let accountName = 'Importação multi-conta'
      if (account_id) {
        const accountCheck = await sb.from('fin_accounts').select('id,nome').eq('id', account_id).eq('ativo', true).maybeSingle()
        if (accountCheck.error) return json(req, { error: 'Erro ao validar conta.' }, 500)
        if (!accountCheck.data?.id) return json(req, { error: 'Conta não encontrada.' }, 404)
        accountName = accountCheck.data.nome
      }

      const importedRows = rows
      const summary = importedRows.reduce((acc, row) => {
        const valor = Number(row.valor || 0)
        if (row.tipo === 'entrada') {
          acc.entradas += 1
          acc.total_entradas += valor
        } else {
          acc.saidas += 1
          acc.total_saidas += valor
        }
        if (row.status === 'pendente') acc.pendentes += 1
        else acc.confirmados += 1
        return acc
      }, {
        entradas: 0,
        saidas: 0,
        confirmados: 0,
        pendentes: 0,
        total_entradas: 0,
        total_saidas: 0,
      })

      const warnings: string[] = []
      const duplicateKeys = new Set<string>()
      const seen = new Set<string>()
      const transferRows = importedRows.filter(row => /transfer/i.test(String(row.descricao || '')))
      const noCategory = importedRows.filter(row => !normalizeText(row.categoria)).length
      const noContact = importedRows.filter(row => !normalizeText(row.contato)).length

      for (const row of importedRows) {
        const key = [row.tipo, normalizeKey(row.descricao), row.competence_date, Number(row.valor || 0)].join('|')
        if (seen.has(key)) duplicateKeys.add(key)
        seen.add(key)
      }

      if (duplicateKeys.size > 0) warnings.push(`${duplicateKeys.size} lançamentos parecem duplicados dentro do próprio arquivo.`)
      if (transferRows.length > 0) warnings.push(`${transferRows.length} lançamentos parecem transferências entre contas e merecem revisão.`)
      if (noCategory > 0) warnings.push(`${noCategory} linhas vieram sem categoria e dependerão de fallback automático.`)
      if (noContact > 0) warnings.push(`${noContact} linhas vieram sem contato identificado.`)

      const detectedAccounts = Array.from(new Set(
        importedRows.map(row => normalizeText(row.account_name)).filter(Boolean),
      )) as string[]
      const accountsToCreate: string[] = []
      if (!account_id && detectedAccounts.length > 0) {
        for (const detected of detectedAccounts) {
          const existing = await sb.from('fin_accounts')
            .select('id')
            .eq('ativo', true)
            .eq('nome', detected)
            .maybeSingle()
          if (!existing.data?.id) accountsToCreate.push(detected)
        }
      }

      const aiReview = await analyzeImportWithAi(importedRows, accountName)

      return json(req, {
        account_name: accountName,
        summary,
        accounts_detected: detectedAccounts,
        accounts_to_create: accountsToCreate,
        warnings,
        sample: importedRows.slice(0, 8),
        ai_review: aiReview,
      })
    }

    // ── CRIAR ────────────────────────────────────────────────────────────────
    if (action === 'criar') {
      const {
        tipo, descricao, valor, competence_date, payment_date,
        categoria_id, cliente_id, fornecedor_id,
        account_id, cost_center_id, product_id,
        status, observacoes,
      } = payload

      const parsedValor = parseCurrencyInput(valor)
      const normalizedDescricao = normalizeText(descricao)
      const normalizedCompetenceDate = normalizeDateOnly(competence_date)
      const normalizedPaymentDate = normalizeDateOnly(payment_date)

      if (!tipo || !normalizedDescricao || parsedValor == null || parsedValor <= 0 || !normalizedCompetenceDate) {
        return json(req, { error: 'Campos obrigatórios: tipo, descricao, valor, competence_date.' }, 400)
      }

      // status confirmado sem payment_date => usa competence_date como fallback
      const resolvedPaymentDate = status === 'confirmado'
        ? (normalizedPaymentDate || normalizedCompetenceDate)
        : null

      const { data, error } = await sb.from('fin_transacoes').insert({
        tipo,
        descricao: normalizedDescricao,
        valor: parsedValor,
        data_transacao: normalizedCompetenceDate, // mantém campo legado preenchido
        competence_date: normalizedCompetenceDate,
        payment_date: resolvedPaymentDate,
        categoria_id: categoria_id || null,
        cliente_id: cliente_id || null,
        fornecedor_id: fornecedor_id || null,
        account_id: account_id || null,
        cost_center_id: cost_center_id || null,
        product_id: product_id || null,
        status: status || 'confirmado',
        observacoes: normalizeText(observacoes),
        created_by: user.usuario_id,
      }).select([
        '*',
        'categoria:fin_categorias(id,nome,cor)',
        'account:fin_accounts(id,nome)',
        'cost_center:fin_cost_centers(id,nome)',
        'product:fin_products(id,nome)',
      ].join(',')).single()

      if (error) return json(req, { error: 'Erro ao criar transação.' }, 500)
      return json(req, { transacao: data })
    }

    // ── ATUALIZAR ────────────────────────────────────────────────────────────
    if (action === 'atualizar') {
      const { id, ...fields } = payload
      if (!id) return json(req, { error: 'ID obrigatório.' }, 400)

      const currentResult = await sb.from('fin_transacoes')
        .select('competence_date, payment_date, status')
        .eq('id', id)
        .single()
      if (currentResult.error || !currentResult.data) {
        return json(req, { error: 'Transação não encontrada.' }, 404)
      }

      const allowed = [
        'tipo', 'descricao', 'valor',
        'competence_date', 'payment_date',
        'categoria_id', 'cliente_id', 'fornecedor_id',
        'account_id', 'cost_center_id', 'product_id',
        'status', 'observacoes',
      ]
      const update: Record<string, any> = { updated_at: new Date().toISOString() }
      for (const k of allowed) {
        if (fields[k] !== undefined) update[k] = fields[k]
      }

      if (update.valor !== undefined) {
        const parsedValor = parseCurrencyInput(update.valor)
        if (parsedValor == null || parsedValor <= 0) return json(req, { error: 'Valor inválido.' }, 400)
        update.valor = parsedValor
      }
      if (update.descricao !== undefined) {
        const normalizedDescricao = normalizeText(update.descricao)
        if (!normalizedDescricao) return json(req, { error: 'Descrição obrigatória.' }, 400)
        update.descricao = normalizedDescricao
      }
      if (update.competence_date !== undefined) {
        const normalizedCompetenceDate = normalizeDateOnly(update.competence_date)
        if (!normalizedCompetenceDate) return json(req, { error: 'Data de competência inválida.' }, 400)
        update.competence_date = normalizedCompetenceDate
      }
      if (update.payment_date !== undefined) {
        const normalizedPaymentDate = normalizeDateOnly(update.payment_date)
        if (update.payment_date !== null && !normalizedPaymentDate) {
          return json(req, { error: 'Data de pagamento inválida.' }, 400)
        }
        update.payment_date = normalizedPaymentDate
      }
      if (update.observacoes !== undefined) update.observacoes = normalizeText(update.observacoes)

      // Sincroniza data_transacao legado com competence_date se presente
      if (update.competence_date) update.data_transacao = update.competence_date

      // Limpa payment_date quando status volta para pendente
      if (update.status === 'pendente') update.payment_date = null
      if (update.status === 'confirmado' && !update.payment_date) {
        update.payment_date = currentResult.data.payment_date || update.competence_date || currentResult.data.competence_date
      }

      const { data, error } = await sb.from('fin_transacoes')
        .update(update).eq('id', id)
        .select([
          '*',
          'categoria:fin_categorias(id,nome,cor)',
          'account:fin_accounts(id,nome)',
          'cost_center:fin_cost_centers(id,nome)',
          'product:fin_products(id,nome)',
        ].join(',')).single()

      if (error) return json(req, { error: 'Erro ao atualizar transação.' }, 500)
      return json(req, { transacao: data })
    }

    // ── DELETAR ──────────────────────────────────────────────────────────────
    if (action === 'deletar') {
      const { id } = payload
      if (!id) return json(req, { error: 'ID obrigatório.' }, 400)
      const { error } = await sb.from('fin_transacoes').delete().eq('id', id)
      if (error) return json(req, { error: 'Erro ao deletar transação.' }, 500)
      return json(req, { ok: true })
    }

    // ── RESUMO ───────────────────────────────────────────────────────────────
    if (action === 'resumo') {
      const { view = 'competencia', account_id, date_start, date_end } = payload

      let q = sb.from('fin_transacoes').select('tipo, valor, status, payment_date, account_id, descricao, observacoes, categoria:fin_categorias(nome)')
      let accountsQuery = sb.from('fin_accounts').select('id, saldo_inicial')
      if (account_id) {
        q = q.eq('account_id', account_id)
        accountsQuery = accountsQuery.eq('id', account_id)
      } else {
        const { data: inactiveAccounts } = await sb.from('fin_accounts').select('id').eq('ativo', false)
        const inactiveIds = (inactiveAccounts ?? []).map((a: any) => a.id)
        if (inactiveIds.length > 0) {
          q = q.not('account_id', 'in', `(${inactiveIds.join(',')})`)
          accountsQuery = accountsQuery.eq('ativo', true)
        } else {
          accountsQuery = accountsQuery.eq('ativo', true)
        }
      }

      if (date_start && date_end) {
        if (view === 'caixa') {
          q = q.not('payment_date', 'is', null)
            .gte('payment_date', date_start).lte('payment_date', date_end)
            .eq('status', 'confirmado')
        } else {
          q = q.gte('competence_date', date_start).lte('competence_date', date_end)
        }
      }

      const { data, error } = await q
      if (error) return json(req, { error: 'Erro ao buscar resumo.' }, 500)

      const dataSemTransferenciasInternas = (data ?? []).filter((t: any) => !isInternalTransferTransaction(t))

      const entradas = dataSemTransferenciasInternas
        .filter((t: any) => t.tipo === 'entrada')
        .reduce((s: number, t: any) => s + Number(t.valor), 0)
      const saidas = dataSemTransferenciasInternas
        .filter((t: any) => t.tipo === 'saida')
        .reduce((s: number, t: any) => s + Number(t.valor), 0)

      const { data: accounts, error: accountsError } = await accountsQuery
      if (accountsError) return json(req, { error: 'Erro ao buscar contas para o saldo geral.' }, 500)

      let saldoGeral = (accounts ?? []).reduce((sum: number, account: any) => sum + Number(account.saldo_inicial || 0), 0)
      const accountIds = (accounts ?? []).map((account: any) => account.id).filter(Boolean)

      if (!account_id && accountIds.length === 0) {
        return json(req, { entradas, saidas, saldo: saldoGeral, view })
      }

      let saldoTxQuery = sb.from('fin_transacoes')
        .select('account_id, tipo, valor')
        .eq('status', 'confirmado')
        .not('account_id', 'is', null)

      if (account_id) saldoTxQuery = saldoTxQuery.eq('account_id', account_id)
      else saldoTxQuery = saldoTxQuery.in('account_id', accountIds)

      const { data: saldoTxs, error: saldoTxsError } = await saldoTxQuery
      if (saldoTxsError) return json(req, { error: 'Erro ao buscar transações para o saldo geral.' }, 500)

      for (const tx of (saldoTxs ?? [])) {
        saldoGeral += tx.tipo === 'entrada' ? Number(tx.valor || 0) : -Number(tx.valor || 0)
      }

      return json(req, { entradas, saidas, saldo: saldoGeral, view })
    }

    return json(req, { error: 'Ação inválida.' }, 400)

  } catch (e) {
    console.error('[financeiro-transacoes]', e)
    return json(req, { error: 'Erro interno.' }, 500)
  }
})
