ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS canonical_remote_jid text;

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS chat_type text;

UPDATE public.chat_messages
SET chat_type = CASE
  WHEN remote_jid LIKE '%@g.us' THEN 'group'
  ELSE 'direct'
END
WHERE chat_type IS NULL;

UPDATE public.chat_messages
SET canonical_remote_jid = CASE
  WHEN remote_jid LIKE '%@g.us' THEN remote_jid
  WHEN remote_jid LIKE '%@lid' THEN remote_jid
  WHEN phone_normalized IS NOT NULL AND phone_normalized <> '' THEN phone_normalized || '@s.whatsapp.net'
  ELSE remote_jid
END
WHERE canonical_remote_jid IS NULL
   OR canonical_remote_jid = '';

ALTER TABLE public.chat_messages
  ALTER COLUMN chat_type SET DEFAULT 'direct';

ALTER TABLE public.chat_messages
  ALTER COLUMN chat_type SET NOT NULL;

ALTER TABLE public.chat_messages
  ALTER COLUMN canonical_remote_jid SET NOT NULL;

CREATE INDEX IF NOT EXISTS chat_messages_instance_canonical_created_idx
  ON public.chat_messages (instance_name, canonical_remote_jid, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_messages_instance_canonical_timestamp_idx
  ON public.chat_messages (instance_name, canonical_remote_jid, message_timestamp DESC, created_at DESC);

ALTER TABLE public.chat_conversation_settings
  ADD COLUMN IF NOT EXISTS canonical_remote_jid text;

UPDATE public.chat_conversation_settings
SET canonical_remote_jid = CASE
  WHEN remote_jid LIKE '%@g.us' THEN remote_jid
  WHEN remote_jid LIKE '%@lid' THEN remote_jid
  ELSE regexp_replace(remote_jid, '@.*$', '') || '@s.whatsapp.net'
END
WHERE canonical_remote_jid IS NULL
   OR canonical_remote_jid = '';

WITH ranked AS (
  SELECT
    ctid,
    row_number() OVER (
      PARTITION BY instance_name, canonical_remote_jid
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.chat_conversation_settings
)
DELETE FROM public.chat_conversation_settings settings
USING ranked
WHERE settings.ctid = ranked.ctid
  AND ranked.rn > 1;

ALTER TABLE public.chat_conversation_settings
  ALTER COLUMN canonical_remote_jid SET NOT NULL;

ALTER TABLE public.chat_conversation_settings
  DROP CONSTRAINT IF EXISTS chat_conversation_settings_unique;

CREATE UNIQUE INDEX IF NOT EXISTS chat_conversation_settings_instance_canonical_uidx
  ON public.chat_conversation_settings (instance_name, canonical_remote_jid);

CREATE INDEX IF NOT EXISTS chat_conversation_settings_instance_canonical_idx
  ON public.chat_conversation_settings (instance_name, canonical_remote_jid, updated_at DESC);
