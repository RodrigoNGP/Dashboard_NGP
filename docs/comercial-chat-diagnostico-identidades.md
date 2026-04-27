# Comercial: Diagnóstico de Identidades do Chat

## Objetivo

Este material existe para ajudar a investigar os casos residuais do chat do Comercial onde a identidade da conversa ainda pode parecer estranha, especialmente em:

- conversas `@lid`;
- duplicidade aparente entre `@lid` e `@s.whatsapp.net`;
- grupos sem nome resolvido;
- `display_name` com cara de nome da própria instância;
- falhas operacionais do webhook e da persistência.

## Estrutura criada

Migration:

`/supabase/migrations/20260426093000_chat_identity_diagnostics.sql`

Ela entrega:

1. policy de leitura para `public.system_logs`;
2. view `public.chat_identity_diagnostics`;
3. view `public.chat_whatsapp_system_logs_recent`.

## View 1: `public.chat_identity_diagnostics`

Uma linha por conversa projetada em `chat_conversations`, com sinais de risco de identidade.

Campos mais úteis:

- `instance_name`
- `canonical_remote_jid`
- `remote_jid`
- `chat_type`
- `display_name`
- `phone_normalized`
- `profile_push_name`
- `latest_incoming_push_name`
- `is_lid_identity`
- `has_phone_companion`
- `has_lid_companion`
- `companion_jids`
- `display_name_matches_instance`
- `display_name_is_numeric_fallback`
- `missing_group_subject`
- `unresolved_lid_identity`
- `suspicious_self_name_collision`
- `suggested_action`

### Conversas com maior chance de problema

```sql
SELECT
  instance_name,
  canonical_remote_jid,
  display_name,
  chat_type,
  unresolved_lid_identity,
  has_phone_companion,
  missing_group_subject,
  suspicious_self_name_collision,
  suggested_action
FROM public.chat_identity_diagnostics
WHERE unresolved_lid_identity
   OR has_phone_companion
   OR missing_group_subject
   OR suspicious_self_name_collision
ORDER BY last_message_at DESC NULLS LAST;
```

### Casos `@lid` que têm conversa parceira por telefone

```sql
SELECT
  instance_name,
  canonical_remote_jid,
  display_name,
  companion_jids,
  suggested_action
FROM public.chat_identity_diagnostics
WHERE is_lid_identity
  AND has_phone_companion
ORDER BY last_message_at DESC NULLS LAST;
```

### Grupos ainda sem nome real

```sql
SELECT
  instance_name,
  canonical_remote_jid,
  display_name,
  suggested_action
FROM public.chat_identity_diagnostics
WHERE chat_type = 'group'
  AND missing_group_subject
ORDER BY last_message_at DESC NULLS LAST;
```

### Conversas com nome igual ao da instância

```sql
SELECT
  instance_name,
  canonical_remote_jid,
  display_name,
  latest_incoming_push_name,
  profile_push_name,
  suggested_action
FROM public.chat_identity_diagnostics
WHERE suspicious_self_name_collision
ORDER BY last_message_at DESC NULLS LAST;
```

## View 2: `public.chat_whatsapp_system_logs_recent`

Essa view resume os erros recentes de `system_logs` com foco no módulo de chat.

Campos mais úteis:

- `created_at`
- `source`
- `event`
- `severity`
- `instance_name`
- `error_message`
- `diagnostic_hint`

### Falhas recentes do chat

```sql
SELECT
  created_at,
  source,
  event,
  severity,
  instance_name,
  error_message,
  diagnostic_hint
FROM public.chat_whatsapp_system_logs_recent
LIMIT 50;
```

### Falhas por instância

```sql
SELECT
  instance_name,
  event,
  count(*) AS total
FROM public.chat_whatsapp_system_logs_recent
GROUP BY instance_name, event
ORDER BY total DESC, instance_name;
```

## Query tática para um caso específico

Se um contato parecer “quebrado”, rode nessa ordem:

```sql
SELECT *
FROM public.chat_identity_diagnostics
WHERE canonical_remote_jid = 'JID_AQUI';
```

```sql
SELECT
  instance_name,
  canonical_remote_jid,
  remote_jid,
  from_me,
  metadata->>'pushName' AS push_name,
  body,
  message_timestamp,
  created_at
FROM public.chat_messages
WHERE canonical_remote_jid = 'JID_AQUI'
ORDER BY COALESCE(message_timestamp, created_at) DESC
LIMIT 30;
```

```sql
SELECT
  instance_name,
  remote_jid,
  push_name,
  profile_picture_url,
  last_synced_at
FROM public.chat_contact_profiles
WHERE remote_jid = 'JID_AQUI';
```

## Leitura prática

- Se `unresolved_lid_identity = true`:
  o sistema está sendo prudente; ainda não há prova suficiente para juntar esse `@lid` com um telefone.

- Se `has_phone_companion = true` junto com `is_lid_identity = true`:
  existe um forte candidato de conversa paralela; vale comparar histórico antes de consolidar.

- Se `missing_group_subject = true`:
  o grupo entrou, mas o nome ainda não foi resolvido na Evolution/cache.

- Se `suspicious_self_name_collision = true`:
  o nome da conversa está parecendo o nome da própria instância, e isso merece revisão.

## Próximo passo sugerido

Depois de rodar essa migration e usar essas views alguns dias, o ideal é decidir com evidência:

1. quais `@lid` realmente podem ser consolidados com `@s.whatsapp.net`;
2. quais grupos precisam de rotina de sync de subject;
3. quais nomes de conversa devem priorizar CRM, perfil cacheado ou `pushName`.
