CREATE TABLE IF NOT EXISTS public.chat_contact_profiles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_name       text NOT NULL,
  remote_jid          text NOT NULL,
  push_name           text,
  profile_picture_url text,
  last_synced_at      timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_contact_profiles_unique UNIQUE (instance_name, remote_jid)
);

CREATE INDEX IF NOT EXISTS chat_contact_profiles_instance_jid_idx
  ON public.chat_contact_profiles (instance_name, remote_jid);

ALTER TABLE public.chat_contact_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ngp_read_chat_contact_profiles_by_instance" ON public.chat_contact_profiles;
CREATE POLICY "ngp_read_chat_contact_profiles_by_instance"
  ON public.chat_contact_profiles
  FOR SELECT
  USING (public.can_access_whatsapp_instance(instance_name));

DROP POLICY IF EXISTS "ngp_insert_chat_contact_profiles_by_instance" ON public.chat_contact_profiles;
CREATE POLICY "ngp_insert_chat_contact_profiles_by_instance"
  ON public.chat_contact_profiles
  FOR INSERT
  WITH CHECK (public.can_access_whatsapp_instance(instance_name));

DROP POLICY IF EXISTS "ngp_update_chat_contact_profiles_by_instance" ON public.chat_contact_profiles;
CREATE POLICY "ngp_update_chat_contact_profiles_by_instance"
  ON public.chat_contact_profiles
  FOR UPDATE
  USING (public.can_access_whatsapp_instance(instance_name))
  WITH CHECK (public.can_access_whatsapp_instance(instance_name));
