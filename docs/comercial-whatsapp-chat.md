# Comercial: Chat WhatsApp Espelhado

## Escopo

Documento focado exclusivamente no setor Comercial da NGP e na funcionalidade de chat que espelha o WhatsApp conectado via Evolution API dentro do NGP Space.

## Arquitetura Atual

1. Frontend:
`/app/comercial/chat/page.tsx` lista conversas, carrega mensagens e assina `Supabase Realtime`.

2. Chat dentro do lead:
`/app/comercial/pipeline/ChatTab.tsx` espelha o histórico vinculado ao `lead_id`.

3. Envio:
`/supabase/functions/whatsapp-send/index.ts` chama a Evolution API e salva a mensagem no `chat_messages`.

4. Entrada via webhook:
`/supabase/functions/whatsapp-webhook/index.ts` recebe `MESSAGES_UPSERT`, normaliza a mensagem, vincula lead por telefone e grava no `chat_messages`.

5. Importação de histórico:
`/supabase/functions/whatsapp-sync/index.ts` puxa mensagens retroativas da Evolution e faz `upsert` na mesma tabela.

## Modelo de Dados

Tabela principal: `public.chat_messages`

Campos relevantes para ordenação e idempotência:

- `instance_name`: nome da instância da Evolution conectada ao Comercial.
- `evolution_message_id`: ID único da mensagem na Evolution.
- `remote_jid`: identificador do contato no WhatsApp.
- `phone_normalized`: telefone normalizado para vincular com `crm_leads`.
- `lead_id`: relacionamento opcional com `public.crm_leads`.
- `from_me`: diferencia mensagens enviadas pelo Comercial das recebidas.
- `body`: conteúdo textual ou legenda.
- `message_type`: tipo da mensagem.
- `ai_suggestion`: sugestão de resposta comercial gerada no recebimento.
- `message_timestamp`: timestamp original vindo da Evolution (`messageTimestamp`).
- `created_at`: horário em que o banco gravou a linha.

Restrição crítica:

- `UNIQUE (instance_name, evolution_message_id)`: impede duplicidade da mesma mensagem se o webhook reenviar o mesmo evento.

## Relação com as Instâncias da Evolution

- As instâncias ficam em `public.whatsapp_instances`.
- `chat_messages.instance_name` aponta logicamente para a instância da Evolution que originou ou enviou a mensagem.
- O frontend do Comercial filtra conversas por `instance_name`.
- O webhook recebe o nome da instância do payload da Evolution e persiste esse valor na mensagem.

## Diagnóstico Encontrado

### 1. Ordem cronológica

O sistema já salva `message_timestamp`, mas havia trechos importantes do frontend carregando e montando a UI com base em `created_at`.

Impacto:

- mensagens gravadas com atraso pelo webhook podem aparecer fora de ordem;
- a lista lateral pode mostrar prévia incorreta como "última mensagem";
- o feed pode ficar cronologicamente errado ao receber `INSERT` em tempo real.

Ajuste aplicado:

- o frontend agora usa `message_timestamp || created_at` como tempo efetivo;
- a ordenação final do feed e da lista de conversas é refeita no cliente com esse tempo efetivo.

Regra recomendada:

- `created_at` deve continuar existindo como auditoria de persistência;
- a ordem visual do chat deve usar `message_timestamp` da Evolution como fonte principal.

### 2. Realtime do Supabase

O chat principal estava ouvindo `INSERT`, mas só atualizava corretamente a conversa aberta. Mensagens novas em outras conversas podiam entrar no banco sem subir na sidebar até reload manual.

Ajuste aplicado:

- a assinatura agora observa a instância ativa inteira;
- qualquer `INSERT` reorganiza a lista de conversas;
- se a conversa aberta for a afetada, o feed também é atualizado e reordenado.

### 3. Webhook com risco de timeout

O webhook respondia `200` apenas depois de:

- validar e iterar mensagens;
- consultar leads;
- consultar histórico recente;
- eventualmente gerar sugestão com IA.

Impacto:

- risco de timeout na Evolution;
- backoff ou atraso no reenvio de eventos;
- sensação de "mensagem chegou no WhatsApp, mas não apareceu no CRM".

Ajuste aplicado:

- o endpoint agora retorna `200` imediatamente;
- o processamento segue em background com `EdgeRuntime.waitUntil(...)` quando disponível.

### 4. Segurança e auditoria

As tabelas do chat agora foram preparadas para isolamento por `instance_name` com apoio da sessão do NGP enviada no header `x-session-token`.

Medidas aplicadas:

- `RLS` reforçada em `whatsapp_instances` e `chat_messages`;
- leitura permitida apenas quando a sessão ativa pertence ao dono da instância;
- `FORCE ROW LEVEL SECURITY` ativada nas tabelas de chat;
- criação de `system_logs` para auditoria de falhas assíncronas do webhook;
- webhook rejeita chamadas sem `EVOLUTION_WEBHOOK_SECRET` configurado ou com header inválido.

## Fluxo Recomendado

### Saída

1. Comercial envia a mensagem pelo chat do NGP.
2. `whatsapp-send` chama a Evolution.
3. A mensagem é persistida imediatamente no `chat_messages`.
4. O frontend mostra a mensagem de forma otimista e depois recebe a versão persistida via Realtime.

### Entrada

1. O cliente responde no WhatsApp.
2. A Evolution dispara `MESSAGES_UPSERT`.
3. `whatsapp-webhook` responde `200` rápido.
4. O processamento salva a mensagem com `message_timestamp`.
5. O `Supabase Realtime` publica o `INSERT`.
6. O Comercial recebe o refresh da conversa e do feed.

## Query de Debug

Para validar a ordem real de entrada no banco:

```sql
SELECT
  id,
  body,
  created_at,
  message_timestamp,
  remote_jid,
  instance_name,
  from_me,
  evolution_message_id
FROM public.chat_messages
ORDER BY created_at DESC
LIMIT 10;
```

Para comparar ordem visual correta:

```sql
SELECT
  id,
  body,
  message_timestamp,
  created_at,
  COALESCE(message_timestamp, created_at) AS effective_ts,
  remote_jid
FROM public.chat_messages
ORDER BY COALESCE(message_timestamp, created_at) DESC
LIMIT 20;
```

## Próximos Cuidados

- revisar `whatsapp-send` e `whatsapp-sync` para garantir consistência do escopo da instância com a tabela `whatsapp_instances`;
- considerar índice futuro por `COALESCE(message_timestamp, created_at)` se o volume de mensagens crescer bastante;
- registrar eventos de erro e status de subscription para diagnosticar desconexões de Realtime.
