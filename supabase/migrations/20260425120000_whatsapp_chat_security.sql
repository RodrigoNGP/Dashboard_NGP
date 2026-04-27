ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL;

UPDATE public.whatsapp_instances
SET usuario_id = cliente_id
WHERE usuario_id IS NULL
  AND cliente_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS whatsapp_instances_usuario_idx
  ON public.whatsapp_instances (usuario_id, status);

CREATE TABLE IF NOT EXISTS public.system_logs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope                text NOT NULL,
  source               text NOT NULL,
  event                text NOT NULL,
  severity             text NOT NULL DEFAULT 'error',
  instance_name        text,
  evolution_message_id text,
  error_message        text,
  payload              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS system_logs_scope_created_idx
  ON public.system_logs (scope, created_at DESC);

CREATE INDEX IF NOT EXISTS system_logs_instance_created_idx
  ON public.system_logs (instance_name, created_at DESC);

ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_instances FORCE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ngp_read_whatsapp_instances" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "ngp_read_chat_messages" ON public.chat_messages;

CREATE OR REPLACE FUNCTION public.current_ngp_session_token()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.headers', true)::jsonb ->> 'x-session-token', '');
$$;

CREATE OR REPLACE FUNCTION public.current_ngp_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.usuario_id
  FROM public.sessions s
  JOIN public.usuarios u ON u.id = s.usuario_id
  WHERE s.token = public.current_ngp_session_token()
    AND s.expires_at > now()
    AND u.role IN ('admin', 'ngp')
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_ngp_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_ngp_user_id() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_access_whatsapp_instance(target_instance_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.whatsapp_instances wi
    WHERE wi.instance_name = target_instance_name
      AND wi.usuario_id = public.current_ngp_user_id()
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_whatsapp_instance(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_whatsapp_instance(text) TO anon, authenticated, service_role;

CREATE POLICY "ngp_read_whatsapp_instances_by_session"
  ON public.whatsapp_instances
  FOR SELECT
  USING (
    usuario_id = public.current_ngp_user_id()
    AND public.can_access_whatsapp_instance(instance_name)
  );

CREATE POLICY "ngp_read_chat_messages_by_instance"
  ON public.chat_messages
  FOR SELECT
  USING (public.can_access_whatsapp_instance(instance_name));

CREATE INDEX IF NOT EXISTS chat_messages_instance_timestamp_idx
  ON public.chat_messages (instance_name, message_timestamp DESC, created_at DESC);
