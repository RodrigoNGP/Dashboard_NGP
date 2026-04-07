import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { session_token, cliente_id, cliente_username } = await req.json();

    if (!session_token) {
      return json(req, { error: 'Sessão inválida.' }, 401);
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

    return json(req, { relatorios: data || [] });

  } catch (e) {
    return json(req, { error: String(e) }, 500);
  }
});
