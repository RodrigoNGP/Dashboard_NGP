DROP POLICY IF EXISTS "ngp_read_system_logs_by_instance" ON public.system_logs;
CREATE POLICY "ngp_read_system_logs_by_instance"
  ON public.system_logs
  FOR SELECT
  USING (
    public.current_ngp_user_id() IS NOT NULL
    AND (
      instance_name IS NULL
      OR public.can_access_whatsapp_instance(instance_name)
    )
  );

CREATE OR REPLACE VIEW public.chat_identity_diagnostics
WITH (security_invoker = true) AS
WITH latest_incoming_push_names AS (
  SELECT DISTINCT ON (msg.instance_name, msg.canonical_remote_jid)
    msg.instance_name,
    msg.canonical_remote_jid,
    NULLIF(msg.metadata->>'pushName', '') AS latest_incoming_push_name
  FROM public.chat_messages msg
  WHERE msg.from_me = false
    AND NULLIF(msg.metadata->>'pushName', '') IS NOT NULL
  ORDER BY
    msg.instance_name,
    msg.canonical_remote_jid,
    COALESCE(msg.message_timestamp, msg.created_at) DESC,
    msg.created_at DESC
),
conversation_base AS (
  SELECT
    conv.instance_name,
    conv.canonical_remote_jid,
    conv.remote_jid,
    conv.chat_type,
    conv.display_name,
    conv.phone_normalized,
    conv.lead_id,
    conv.last_message_at,
    regexp_replace(conv.canonical_remote_jid, '@.*$', '') AS jid_local_part,
    wi.display_name AS instance_display_name,
    profiles.push_name AS profile_push_name,
    incoming.latest_incoming_push_name
  FROM public.chat_conversations conv
  LEFT JOIN public.whatsapp_instances wi
    ON wi.instance_name = conv.instance_name
  LEFT JOIN public.chat_contact_profiles profiles
    ON profiles.instance_name = conv.instance_name
   AND profiles.remote_jid = conv.canonical_remote_jid
  LEFT JOIN latest_incoming_push_names incoming
    ON incoming.instance_name = conv.instance_name
   AND incoming.canonical_remote_jid = conv.canonical_remote_jid
),
companions AS (
  SELECT
    base.instance_name,
    base.canonical_remote_jid,
    COUNT(*) FILTER (
      WHERE peer.canonical_remote_jid IS NOT NULL
        AND peer.canonical_remote_jid <> base.canonical_remote_jid
    ) AS companion_count,
    COALESCE(BOOL_OR(
      peer.canonical_remote_jid <> base.canonical_remote_jid
      AND peer.canonical_remote_jid LIKE '%@lid'
    ), false) AS has_lid_companion,
    COALESCE(BOOL_OR(
      peer.canonical_remote_jid <> base.canonical_remote_jid
      AND peer.canonical_remote_jid LIKE '%@s.whatsapp.net'
    ), false) AS has_phone_companion,
    ARRAY_REMOVE(
      ARRAY_AGG(DISTINCT CASE
        WHEN peer.canonical_remote_jid <> base.canonical_remote_jid
        THEN peer.canonical_remote_jid
        ELSE NULL
      END),
      NULL
    ) AS companion_jids
  FROM conversation_base base
  LEFT JOIN conversation_base peer
    ON peer.instance_name = base.instance_name
   AND peer.jid_local_part = base.jid_local_part
  GROUP BY base.instance_name, base.canonical_remote_jid
)
SELECT
  base.instance_name,
  base.canonical_remote_jid,
  base.remote_jid,
  base.chat_type,
  base.display_name,
  base.phone_normalized,
  base.lead_id,
  base.last_message_at,
  base.jid_local_part,
  base.instance_display_name,
  base.profile_push_name,
  base.latest_incoming_push_name,
  (base.canonical_remote_jid LIKE '%@lid') AS is_lid_identity,
  (base.canonical_remote_jid LIKE '%@s.whatsapp.net') AS is_phone_identity,
  (base.canonical_remote_jid LIKE '%@g.us') AS is_group_identity,
  COALESCE(companions.companion_count, 0) AS companion_count,
  COALESCE(companions.has_lid_companion, false) AS has_lid_companion,
  COALESCE(companions.has_phone_companion, false) AS has_phone_companion,
  COALESCE(companions.companion_jids, '{}'::text[]) AS companion_jids,
  (
    base.display_name IS NOT NULL
    AND base.instance_display_name IS NOT NULL
    AND base.display_name = base.instance_display_name
  ) AS display_name_matches_instance,
  (
    base.display_name IS NOT NULL
    AND base.display_name = base.jid_local_part
  ) AS display_name_is_numeric_fallback,
  (
    base.chat_type = 'group'
    AND (
      COALESCE(base.display_name, '') = ''
      OR base.display_name = base.jid_local_part
    )
  ) AS missing_group_subject,
  (
    base.canonical_remote_jid LIKE '%@lid'
    AND NOT COALESCE(companions.has_phone_companion, false)
  ) AS unresolved_lid_identity,
  (
    base.chat_type = 'direct'
    AND (
      (
        base.display_name IS NOT NULL
        AND base.instance_display_name IS NOT NULL
        AND base.display_name = base.instance_display_name
      )
      OR (
        base.latest_incoming_push_name IS NOT NULL
        AND base.instance_display_name IS NOT NULL
        AND base.latest_incoming_push_name = base.instance_display_name
      )
    )
  ) AS suspicious_self_name_collision,
  CASE
    WHEN base.chat_type = 'group'
      AND (
        COALESCE(base.display_name, '') = ''
        OR base.display_name = base.jid_local_part
      )
      THEN 'Resolver o subject do grupo na Evolution e sincronizar chat_contact_profiles.'
    WHEN base.canonical_remote_jid LIKE '%@lid'
      AND COALESCE(companions.has_phone_companion, false)
      THEN 'Existe conversa parceira por telefone. Verificar se o @lid e o @s.whatsapp.net representam a mesma pessoa antes de consolidar.'
    WHEN base.canonical_remote_jid LIKE '%@lid'
      THEN 'Identidade @lid sem telefone confirmado. Manter separada por enquanto e observar novas mensagens.'
    WHEN base.chat_type = 'direct'
      AND base.display_name IS NOT NULL
      AND base.instance_display_name IS NOT NULL
      AND base.display_name = base.instance_display_name
      THEN 'Nome da conversa coincide com a instância. Revisar pushName recebido e chat_contact_profiles.'
    WHEN base.display_name IS NOT NULL
      AND base.display_name = base.jid_local_part
      THEN 'Conversa caiu em fallback numérico. Tentar resolver nome em chat_contact_profiles ou crm_leads.'
    ELSE 'Sem alerta estrutural no momento.'
  END AS suggested_action
FROM conversation_base base
LEFT JOIN companions
  ON companions.instance_name = base.instance_name
 AND companions.canonical_remote_jid = base.canonical_remote_jid;

CREATE OR REPLACE VIEW public.chat_whatsapp_system_logs_recent
WITH (security_invoker = true) AS
SELECT
  logs.id,
  logs.created_at,
  logs.scope,
  logs.source,
  logs.event,
  logs.severity,
  logs.instance_name,
  logs.evolution_message_id,
  logs.error_message,
  logs.payload,
  CASE
    WHEN logs.event = 'unknown_instance_webhook'
      THEN 'Webhook recebeu uma instância que não existe no NGP.'
    WHEN logs.event = 'async_processing_failed'
      THEN 'Falha no processamento assíncrono do webhook após o 200 OK.'
    WHEN logs.event = 'send_persist_failed'
      THEN 'Mensagem foi enviada para a Evolution, mas não confirmou persistência no banco.'
    ELSE 'Verificar payload e contexto da function de origem.'
  END AS diagnostic_hint
FROM public.system_logs logs
WHERE logs.scope = 'whatsapp-chat'
ORDER BY logs.created_at DESC;
