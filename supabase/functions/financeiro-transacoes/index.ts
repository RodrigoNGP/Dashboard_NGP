import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { handleCors, json } from "../_shared/cors.ts"
import { validateSession } from "../_shared/roles.ts"

async function checkFinanceiroAccess(sb: any, usuario_id: string): Promise<boolean> {
  const { data } = await sb.from('usuarios').select('acesso_financeiro, ativo').eq('id', usuario_id).single()
  return !!data?.acesso_financeiro && !!data?.ativo
}

// Retorna o último dia do mês para filtros de período
function lastDayOfMonth(ano: number, mes: number): string {
  return new Date(ano, mes, 0).toISOString().split('T')[0]
}

serve(async (req) => {
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
      const { tipo, mes, ano, view = 'competencia' } = payload
      // view='competencia' filtra por competence_date (visão DRE)
      // view='caixa' filtra por payment_date (visão fluxo de caixa)
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

      if (tipo) q = q.eq('tipo', tipo)

      if (mes && ano) {
        const start = `${ano}-${String(mes).padStart(2, '0')}-01`
        const end = lastDayOfMonth(Number(ano), Number(mes))
        if (view === 'caixa') {
          q = q.not('payment_date', 'is', null)
            .gte('payment_date', start).lte('payment_date', end)
        } else {
          q = q.gte('competence_date', start).lte('competence_date', end)
        }
      }

      const { data, error } = await q
      if (error) return json(req, { error: 'Erro ao buscar transações.' }, 500)
      return json(req, { transacoes: data })
    }

    // ── CRIAR ────────────────────────────────────────────────────────────────
    if (action === 'criar') {
      const {
        tipo, descricao, valor, competence_date, payment_date,
        categoria_id, cliente_id, fornecedor_id,
        account_id, cost_center_id, product_id,
        status, observacoes,
      } = payload

      if (!tipo || !descricao || !valor || !competence_date) {
        return json(req, { error: 'Campos obrigatórios: tipo, descricao, valor, competence_date.' }, 400)
      }

      // status confirmado sem payment_date => usa competence_date como fallback
      const resolvedPaymentDate = status === 'confirmado'
        ? (payment_date || competence_date)
        : null

      const { data, error } = await sb.from('fin_transacoes').insert({
        tipo,
        descricao,
        valor: Number(valor),
        data_transacao: competence_date, // mantém campo legado preenchido
        competence_date,
        payment_date: resolvedPaymentDate,
        categoria_id: categoria_id || null,
        cliente_id: cliente_id || null,
        fornecedor_id: fornecedor_id || null,
        account_id: account_id || null,
        cost_center_id: cost_center_id || null,
        product_id: product_id || null,
        status: status || 'confirmado',
        observacoes: observacoes || null,
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

      // Sincroniza data_transacao legado com competence_date se presente
      if (update.competence_date) update.data_transacao = update.competence_date

      // Limpa payment_date quando status volta para pendente
      if (update.status === 'pendente') update.payment_date = null

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
      const { mes, ano, view = 'competencia' } = payload
      const start = `${ano}-${String(mes).padStart(2, '0')}-01`
      const end = lastDayOfMonth(Number(ano), Number(mes))

      let q = sb.from('fin_transacoes').select('tipo, valor, status, payment_date')

      if (view === 'caixa') {
        // Fluxo de caixa: só transações com pagamento confirmado no período
        q = q.not('payment_date', 'is', null)
          .gte('payment_date', start).lte('payment_date', end)
          .eq('status', 'confirmado')
      } else {
        // DRE/Competência: todas as transações do período (pagas ou não)
        q = q.gte('competence_date', start).lte('competence_date', end)
      }

      const { data, error } = await q
      if (error) return json(req, { error: 'Erro ao buscar resumo.' }, 500)

      const entradas = data
        .filter((t: any) => t.tipo === 'entrada')
        .reduce((s: number, t: any) => s + Number(t.valor), 0)
      const saidas = data
        .filter((t: any) => t.tipo === 'saida')
        .reduce((s: number, t: any) => s + Number(t.valor), 0)

      return json(req, { entradas, saidas, saldo: entradas - saidas, view })
    }

    return json(req, { error: 'Ação inválida.' }, 400)

  } catch (e) {
    console.error('[financeiro-transacoes]', e)
    return json(req, { error: 'Erro interno.' }, 500)
  }
})
