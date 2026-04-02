import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const errMsg = (e: unknown): string => {
  if (!e) return 'Erro desconhecido';
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  const obj = e as Record<string, unknown>;
  return String(obj.message || obj.details || obj.hint || obj.code || JSON.stringify(e));
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const { session_token, nome, username, meta_account_id, senha, foto_base64, foto_mime } = await req.json();

    if (!session_token) {
      return new Response(JSON.stringify({ error: 'Sessão inválida.' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    if (!nome || !username) {
      return new Response(JSON.stringify({ error: 'Nome e username são obrigatórios.' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    if (!senha) {
      return new Response(JSON.stringify({ error: 'Senha é obrigatória.' }), {
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

    // Verifica se username já existe
    const { data: existing } = await sb
      .from('usuarios')
      .select('id')
      .eq('username', username.trim().toLowerCase())
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: 'Username já está em uso.' }), {
        status: 409, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Upload de foto se fornecida
    let fotoUrl: string | null = null;
    if (foto_base64 && foto_mime) {
      const ext  = foto_mime.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
      const path = `${username.trim().toLowerCase()}/avatar.${ext}`;
      const bytes = Uint8Array.from(atob(foto_base64), c => c.charCodeAt(0));
      const { error: uploadErr } = await sb.storage
        .from('avatars')
        .upload(path, bytes, { contentType: foto_mime, upsert: true });
      if (!uploadErr) {
        fotoUrl = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl + '?v=' + Date.now();
      }
    }

    const insertData: Record<string, unknown> = {
      nome:          nome.trim(),
      username:      username.trim().toLowerCase(),
      role:          'cliente',
      ativo:         true,
      password_hash: senha,
    };
    if (meta_account_id) insertData.meta_account_id = meta_account_id.trim();
    if (fotoUrl) insertData.foto_url = fotoUrl;

    const { error } = await sb.from('usuarios').insert(insertData);

    if (error) {
      console.error('[add-cliente] insert error:', JSON.stringify(error));
      return new Response(JSON.stringify({ error: errMsg(error) }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('[add-cliente] catch:', e);
    return new Response(JSON.stringify({ error: errMsg(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
