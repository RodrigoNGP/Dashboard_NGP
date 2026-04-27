CREATE TABLE IF NOT EXISTS public.chat_conversation_settings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_name       text NOT NULL,
  remote_jid          text NOT NULL,
  suggestions_enabled boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_conversation_settings_unique UNIQUE (instance_name, remote_jid)
);

CREATE INDEX IF NOT EXISTS chat_conversation_settings_instance_jid_idx
  ON public.chat_conversation_settings (instance_name, remote_jid);

ALTER TABLE public.chat_conversation_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ngp_read_chat_conversation_settings_by_instance" ON public.chat_conversation_settings;
CREATE POLICY "ngp_read_chat_conversation_settings_by_instance"
  ON public.chat_conversation_settings
  FOR SELECT
  USING (public.can_access_whatsapp_instance(instance_name));

DROP POLICY IF EXISTS "ngp_insert_chat_conversation_settings_by_instance" ON public.chat_conversation_settings;
CREATE POLICY "ngp_insert_chat_conversation_settings_by_instance"
  ON public.chat_conversation_settings
  FOR INSERT
  WITH CHECK (public.can_access_whatsapp_instance(instance_name));

DROP POLICY IF EXISTS "ngp_update_chat_conversation_settings_by_instance" ON public.chat_conversation_settings;
CREATE POLICY "ngp_update_chat_conversation_settings_by_instance"
  ON public.chat_conversation_settings
  FOR UPDATE
  USING (public.can_access_whatsapp_instance(instance_name))
  WITH CHECK (public.can_access_whatsapp_instance(instance_name));
