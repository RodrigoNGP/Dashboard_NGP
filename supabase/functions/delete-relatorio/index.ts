import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const { session_token, id } = await req.json();

    // Valida UUID
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !UUID_RE.test(id)) {
      return new Response(JSON.stringify({ error: 'ID inválido.' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // Valida sessão NGP
    const SURL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(SURL, SERVICE);

    if (!session_token) {
      return new Response(JSON.stringify({ error: 'Sessão inválida.' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // Verifica que a sessão existe na tabela ngp_sessions
    const { data: sess } = await sb
      .from('ngp_sessions')
      .select('username, role')
      .eq('token', session_token)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!sess) {
      return new Response(JSON.stringify({ error: 'Sessão expirada. Faça login novamente.' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // Se for NGP (gestor), pode deletar qualquer relatório
    // Se for cliente, só pode deletar os próprios
    let query = sb.from('relatorios').delete().eq('id', id);
    if (sess.role !== 'ngp' && sess.role !== 'admin') {
      query = query.eq('cliente_username', sess.username);
    }

    const { error } = await query;
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
