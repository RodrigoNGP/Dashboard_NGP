import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { session_token, id } = await req.json();

    // Valida UUID
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !UUID_RE.test(id)) {
      return json(req, { error: 'ID inválido.' }, 400);
    }

    if (!session_token) {
      return json(req, { error: 'Sessão inválida.' }, 401);
    }

    const SURL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(SURL, SERVICE);

    // FIX: Usar tabela `sessions` (não `ngp_sessions` que era inconsistente)
    const { data: sessao } = await sb
      .from('sessions')
      .select('usuario_id')
      .eq('token', session_token)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!sessao) {
      return json(req, { error: 'Sessão expirada. Faça login novamente.' }, 401);
    }

    // Buscar role do usuário
    const { data: usuario } = await sb
      .from('usuarios')
      .select('role, username')
      .eq('id', sessao.usuario_id)
      .single();

    if (!usuario) {
      return json(req, { error: 'Usuário não encontrado.' }, 403);
    }

    // Se for NGP (gestor), pode deletar qualquer relatório
    // Se for cliente, só pode deletar os próprios
    let query = sb.from('relatorios').delete().eq('id', id);
    if (usuario.role !== 'ngp' && usuario.role !== 'admin') {
      query = query.eq('cliente_username', usuario.username);
    }

    const { error } = await query;
    if (error) throw error;

    return json(req, { ok: true });
  } catch (e) {
    return json(req, { error: String(e) }, 500);
  }
});
