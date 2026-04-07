import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { session_token, id } = await req.json();

    if (!session_token) {
      return json(req, { error: 'Sessão inválida.' }, 401);
    }

    if (!id) {
      return json(req, { error: 'ID da conta é obrigatório.' }, 400);
    }

    const SURL    = Deno.env.get('SUPABASE_URL')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb      = createClient(SURL, SERVICE);

    // Valida sessão
    const { data: sessao } = await sb
      .from('sessions')
      .select('usuario_id')
      .eq('token', session_token)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!sessao) {
      return json(req, { error: 'Sessão expirada.' }, 401);
    }

    // Apenas NGP pode excluir contas
    const { data: usuario } = await sb
      .from('usuarios')
      .select('role')
      .eq('id', sessao.usuario_id)
      .single();

    if (!usuario || usuario.role !== 'ngp') {
      return json(req, { error: 'Acesso negado.' }, 403);
    }

    // Garante que o alvo é role=cliente (nunca deixa deletar NGP)
    const { error } = await sb
      .from('usuarios')
      .delete()
      .eq('id', id)
      .eq('role', 'cliente');

    if (error) throw error;

    return json(req, { ok: true });

  } catch (e) {
    return json(req, { error: String(e) }, 500);
  }
});
