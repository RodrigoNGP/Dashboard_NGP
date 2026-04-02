import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const { session_token, id, username, nome, meta_account_id, foto_base64, foto_mime } = await req.json();

    if (!session_token) {
      return new Response(JSON.stringify({ error: 'Sessão inválida.' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    if ((!id && !username) || !nome) {
      return new Response(JSON.stringify({ error: 'Id/username e nome são obrigatórios.' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const SURL    = Deno.env.get('SUPABASE_URL')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb      = createClient(SURL, SERVICE);

    // Valida sessão
    const { data: sessao } = await sb
      .from('sessions')
      .select('id, usuario_id')
      .eq('token', session_token)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!sessao) {
      return new Response(JSON.stringify({ error: 'Sessão expirada. Faça login novamente.' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Verifica se é NGP
    const { data: usuario } = await sb
      .from('usuarios')
      .select('role')
      .eq('id', sessao.usuario_id)
      .single();

    if (!usuario || usuario.role !== 'ngp') {
      return new Response(JSON.stringify({ error: 'Acesso negado.' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const updateData: Record<string, string | null> = { nome: nome.trim() };
    updateData.meta_account_id = meta_account_id ? meta_account_id.trim() : null;

    // Upload de foto se fornecida
    let fotoUrl: string | null = null;
    if (foto_base64 && foto_mime) {
      const ext  = foto_mime.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
      const path = `${username.trim().toLowerCase()}/avatar.${ext}`;
      const bytes = Uint8Array.from(atob(foto_base64), c => c.charCodeAt(0));

      const { error: uploadErr } = await sb.storage
        .from('avatars')
        .upload(path, bytes, { contentType: foto_mime, upsert: true });

      if (uploadErr) throw new Error('Erro no upload da foto: ' + uploadErr.message);

      fotoUrl = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      // Cache-busting para forçar reload da imagem no browser
      fotoUrl += '?v=' + Date.now();
      updateData.foto_url = fotoUrl;
    }

    // Prefere filtrar por id (imutável), fallback para username
    let query = sb.from('usuarios').update(updateData).eq('role', 'cliente');
    if (id) {
      query = query.eq('id', id);
    } else {
      query = query.eq('username', username.trim());
    }
    const { error } = await query;

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, foto_url: fotoUrl }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
