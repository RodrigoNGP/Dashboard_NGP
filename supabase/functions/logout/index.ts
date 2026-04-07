import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { handleCors, json } from "../_shared/cors.ts"

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const { token } = await req.json()

    if (!token) {
      return json(req, { ok: true })
    }

    const SURL = Deno.env.get('SUPABASE_URL')!
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const sb = createClient(SURL, SERVICE)

    // Deleta sessão
    await sb.from('sessions').delete().eq('token', token)

    return json(req, { ok: true })

  } catch (e) {
    console.error('[logout] error:', e)
    return json(req, { ok: true })
  }
})
