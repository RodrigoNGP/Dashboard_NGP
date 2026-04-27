CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_name           text NOT NULL,
  canonical_remote_jid    text NOT NULL,
  remote_jid              text NOT NULL,
  phone_normalized        text,
  chat_type               text NOT NULL DEFAULT 'direct',
  lead_id                 uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  display_name            text,
  profile_picture_url     text,
  last_message_preview    text,
  last_message_at         timestamptz,
  last_message_from_me    boolean NOT NULL DEFAULT false,
  last_incoming_message_at timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_conversations_instance_canonical_unique UNIQUE (instance_name, canonical_remote_jid)
);

CREATE INDEX IF NOT EXISTS chat_conversations_instance_last_message_idx
  ON public.chat_conversations (instance_name, last_message_at DESC);

CREATE INDEX IF NOT EXISTS chat_conversations_instance_type_last_message_idx
  ON public.chat_conversations (instance_name, chat_type, last_message_at DESC);

CREATE INDEX IF NOT EXISTS chat_conversations_lead_last_message_idx
  ON public.chat_conversations (lead_id, last_message_at DESC);

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ngp_read_chat_conversations_by_instance" ON public.chat_conversations;
CREATE POLICY "ngp_read_chat_conversations_by_instance"
  ON public.chat_conversations
  FOR SELECT
  USING (public.can_access_whatsapp_instance(instance_name));

DROP POLICY IF EXISTS "ngp_insert_chat_conversations_by_instance" ON public.chat_conversations;
CREATE POLICY "ngp_insert_chat_conversations_by_instance"
  ON public.chat_conversations
  FOR INSERT
  WITH CHECK (public.can_access_whatsapp_instance(instance_name));

DROP POLICY IF EXISTS "ngp_update_chat_conversations_by_instance" ON public.chat_conversations;
CREATE POLICY "ngp_update_chat_conversations_by_instance"
  ON public.chat_conversations
  FOR UPDATE
  USING (public.can_access_whatsapp_instance(instance_name))
  WITH CHECK (public.can_access_whatsapp_instance(instance_name));

CREATE OR REPLACE FUNCTION public.upsert_chat_conversation_projection(
  p_instance_name text,
  p_remote_jid text,
  p_canonical_remote_jid text,
  p_phone_normalized text,
  p_chat_type text,
  p_lead_id uuid,
  p_display_name text,
  p_profile_picture_url text,
  p_last_message_preview text,
  p_last_message_at timestamptz,
  p_last_message_from_me boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resolved_display_name text := NULLIF(p_display_name, '');
  v_instance_display_name text;
BEGIN
  SELECT wi.display_name
  INTO v_instance_display_name
  FROM public.whatsapp_instances wi
  WHERE wi.instance_name = p_instance_name
  LIMIT 1;

  IF p_chat_type = 'direct' AND p_remote_jid LIKE '%@lid' THEN
    v_resolved_display_name := NULL;
  END IF;

  IF v_resolved_display_name IS NOT NULL AND v_instance_display_name IS NOT NULL AND v_resolved_display_name = v_instance_display_name THEN
    v_resolved_display_name := NULL;
  END IF;

  INSERT INTO public.chat_conversations (
    instance_name,
    canonical_remote_jid,
    remote_jid,
    phone_normalized,
    chat_type,
    lead_id,
    display_name,
    profile_picture_url,
    last_message_preview,
    last_message_at,
    last_message_from_me,
    last_incoming_message_at,
    updated_at
  ) VALUES (
    p_instance_name,
    p_canonical_remote_jid,
    p_remote_jid,
    p_phone_normalized,
    COALESCE(p_chat_type, 'direct'),
    p_lead_id,
    v_resolved_display_name,
    NULLIF(p_profile_picture_url, ''),
    p_last_message_preview,
    p_last_message_at,
    COALESCE(p_last_message_from_me, false),
    CASE
      WHEN COALESCE(p_last_message_from_me, false) = false THEN p_last_message_at
      ELSE NULL
    END,
    now()
  )
  ON CONFLICT (instance_name, canonical_remote_jid) DO UPDATE
  SET
    remote_jid = COALESCE(EXCLUDED.remote_jid, public.chat_conversations.remote_jid),
    phone_normalized = COALESCE(EXCLUDED.phone_normalized, public.chat_conversations.phone_normalized),
    chat_type = COALESCE(EXCLUDED.chat_type, public.chat_conversations.chat_type),
    lead_id = COALESCE(EXCLUDED.lead_id, public.chat_conversations.lead_id),
    display_name = COALESCE(EXCLUDED.display_name, public.chat_conversations.display_name),
    profile_picture_url = COALESCE(NULLIF(EXCLUDED.profile_picture_url, ''), public.chat_conversations.profile_picture_url),
    last_message_preview = CASE
      WHEN EXCLUDED.last_message_at IS NOT NULL
       AND (
         public.chat_conversations.last_message_at IS NULL
         OR EXCLUDED.last_message_at >= public.chat_conversations.last_message_at
       )
      THEN EXCLUDED.last_message_preview
      ELSE public.chat_conversations.last_message_preview
    END,
    last_message_at = CASE
      WHEN public.chat_conversations.last_message_at IS NULL THEN EXCLUDED.last_message_at
      WHEN EXCLUDED.last_message_at IS NULL THEN public.chat_conversations.last_message_at
      WHEN EXCLUDED.last_message_at >= public.chat_conversations.last_message_at THEN EXCLUDED.last_message_at
      ELSE public.chat_conversations.last_message_at
    END,
    last_message_from_me = CASE
      WHEN EXCLUDED.last_message_at IS NOT NULL
       AND (
         public.chat_conversations.last_message_at IS NULL
         OR EXCLUDED.last_message_at >= public.chat_conversations.last_message_at
       )
      THEN COALESCE(EXCLUDED.last_message_from_me, public.chat_conversations.last_message_from_me)
      ELSE public.chat_conversations.last_message_from_me
    END,
    last_incoming_message_at = CASE
      WHEN COALESCE(EXCLUDED.last_message_from_me, false) = false
       AND EXCLUDED.last_message_at IS NOT NULL
       AND (
         public.chat_conversations.last_incoming_message_at IS NULL
         OR EXCLUDED.last_message_at >= public.chat_conversations.last_incoming_message_at
       )
      THEN EXCLUDED.last_message_at
      ELSE public.chat_conversations.last_incoming_message_at
    END,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_chat_conversation_projection(text, text, text, text, text, uuid, text, text, text, timestamptz, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_chat_conversation_projection(text, text, text, text, text, uuid, text, text, text, timestamptz, boolean) TO service_role;

WITH latest_messages AS (
  SELECT DISTINCT ON (instance_name, canonical_remote_jid)
    instance_name,
    canonical_remote_jid,
    remote_jid,
    phone_normalized,
    chat_type,
    lead_id,
    body,
    from_me,
    COALESCE(message_timestamp, created_at) AS effective_ts,
    metadata
  FROM public.chat_messages
  ORDER BY instance_name, canonical_remote_jid, COALESCE(message_timestamp, created_at) DESC, created_at DESC
),
incoming_names AS (
  SELECT DISTINCT ON (instance_name, canonical_remote_jid)
    instance_name,
    canonical_remote_jid,
    NULLIF(metadata->>'pushName', '') AS incoming_push_name
  FROM public.chat_messages
  WHERE from_me = false
    AND NULLIF(metadata->>'pushName', '') IS NOT NULL
  ORDER BY instance_name, canonical_remote_jid, COALESCE(message_timestamp, created_at) DESC, created_at DESC
),
last_incoming AS (
  SELECT
    instance_name,
    canonical_remote_jid,
    MAX(COALESCE(message_timestamp, created_at)) AS last_incoming_message_at
  FROM public.chat_messages
  WHERE from_me = false
  GROUP BY instance_name, canonical_remote_jid
)
INSERT INTO public.chat_conversations (
  instance_name,
  canonical_remote_jid,
  remote_jid,
  phone_normalized,
  chat_type,
  lead_id,
  display_name,
  profile_picture_url,
  last_message_preview,
  last_message_at,
  last_message_from_me,
  last_incoming_message_at,
  updated_at
)
SELECT
  latest.instance_name,
  latest.canonical_remote_jid,
  latest.remote_jid,
  latest.phone_normalized,
  COALESCE(latest.chat_type, 'direct'),
  latest.lead_id,
  CASE
    WHEN COALESCE(latest.chat_type, 'direct') = 'group' THEN
      COALESCE(profiles.push_name, regexp_replace(latest.canonical_remote_jid, '@.*$', ''))
    ELSE
      COALESCE(
        leads.company_name,
        profiles.push_name,
        CASE
          WHEN latest.canonical_remote_jid LIKE '%@lid' THEN NULL
          ELSE incoming_names.incoming_push_name
        END,
        latest.phone_normalized,
        regexp_replace(latest.canonical_remote_jid, '@.*$', '')
      )
  END,
  profiles.profile_picture_url,
  latest.body,
  latest.effective_ts,
  latest.from_me,
  incoming.last_incoming_message_at,
  now()
FROM latest_messages latest
LEFT JOIN public.crm_leads leads
  ON leads.id = latest.lead_id
LEFT JOIN public.chat_contact_profiles profiles
  ON profiles.instance_name = latest.instance_name
 AND profiles.remote_jid = latest.canonical_remote_jid
LEFT JOIN incoming_names
  ON incoming_names.instance_name = latest.instance_name
 AND incoming_names.canonical_remote_jid = latest.canonical_remote_jid
LEFT JOIN last_incoming incoming
  ON incoming.instance_name = latest.instance_name
 AND incoming.canonical_remote_jid = latest.canonical_remote_jid
ON CONFLICT (instance_name, canonical_remote_jid) DO UPDATE
SET
  remote_jid = EXCLUDED.remote_jid,
  phone_normalized = COALESCE(EXCLUDED.phone_normalized, public.chat_conversations.phone_normalized),
  chat_type = EXCLUDED.chat_type,
  lead_id = COALESCE(EXCLUDED.lead_id, public.chat_conversations.lead_id),
  display_name = COALESCE(EXCLUDED.display_name, public.chat_conversations.display_name),
  profile_picture_url = COALESCE(EXCLUDED.profile_picture_url, public.chat_conversations.profile_picture_url),
  last_message_preview = EXCLUDED.last_message_preview,
  last_message_at = EXCLUDED.last_message_at,
  last_message_from_me = EXCLUDED.last_message_from_me,
  last_incoming_message_at = COALESCE(EXCLUDED.last_incoming_message_at, public.chat_conversations.last_incoming_message_at),
  updated_at = now();
