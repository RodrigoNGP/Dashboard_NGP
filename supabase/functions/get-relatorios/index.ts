import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const { session_token, cliente_id, cliente_username } = await req.json();

    if (!session_token) {
      return new Response(JSON.stringify({ error: 'Sessão inválida.' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
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
      return new Response(JSON.stringify({ error: 'Sessão expirada.' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Busca relatórios pelo cliente_id ou cliente_username
    let query = sb
      .from('relatorios')
      .select('id, titulo, periodo, updated_at, dados')
      .order('updated_at', { ascending: false });

    if (cliente_id && cliente_username) {
      query = query.or(`cliente_id.eq.${cliente_id},cliente_username.eq.${cliente_username}`);
    } else if (cliente_id) {
      query = query.eq('cliente_id', cliente_id);
    } else if (cliente_username) {
      query = query.eq('cliente_username', cliente_username);
    }

    const { data, error } = await query;

    if (error) throw error;

    return new Response(JSON.stringify({ relatorios: data || [] }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
