WITH incoming_names AS (
  SELECT DISTINCT ON (instance_name, canonical_remote_jid)
    instance_name,
    canonical_remote_jid,
    NULLIF(metadata->>'pushName', '') AS incoming_push_name
  FROM public.chat_messages
  WHERE from_me = false
    AND NULLIF(metadata->>'pushName', '') IS NOT NULL
  ORDER BY instance_name, canonical_remote_jid, COALESCE(message_timestamp, created_at) DESC, created_at DESC
),
instance_display_names AS (
  SELECT DISTINCT display_name
  FROM public.whatsapp_instances
  WHERE NULLIF(display_name, '') IS NOT NULL
),
resolved_names AS (
  SELECT
    conv.id,
    CASE
      WHEN conv.chat_type = 'group' THEN
        COALESCE(profiles.push_name, conv.display_name, regexp_replace(conv.canonical_remote_jid, '@.*$', ''))
      ELSE
        COALESCE(
          leads.company_name,
          profiles.push_name,
          incoming_names.incoming_push_name,
          CASE
            WHEN conv.display_name IN (SELECT display_name FROM instance_display_names) THEN NULL
            ELSE conv.display_name
          END
        )
    END AS next_display_name
  FROM public.chat_conversations conv
  LEFT JOIN public.crm_leads leads
    ON leads.id = conv.lead_id
  LEFT JOIN public.chat_contact_profiles profiles
    ON profiles.instance_name = conv.instance_name
   AND profiles.remote_jid = conv.canonical_remote_jid
  LEFT JOIN incoming_names
    ON incoming_names.instance_name = conv.instance_name
   AND incoming_names.canonical_remote_jid = conv.canonical_remote_jid
)
UPDATE public.chat_conversations conv
SET
  display_name = resolved.next_display_name,
  updated_at = now()
FROM resolved_names resolved
WHERE conv.id = resolved.id
  AND resolved.next_display_name IS DISTINCT FROM conv.display_name;
