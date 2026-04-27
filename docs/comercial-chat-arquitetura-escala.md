# Comercial: Arquitetura de Banco e Escala do Chat

## Objetivo

Este documento explica como a feature de chat do Comercial funciona hoje no banco de dados do NGP Space, quais são os pontos de crescimento de storage e como essa arquitetura deve evoluir se o produto passar a atender muitos clientes e alto volume de mensagens.

O foco aqui é:

- modelo de dados;
- fluxo de gravação e leitura;
- consumo de espaço;
- riscos de escala;
- arquitetura recomendada para médio e grande volume.

## Resumo Executivo

Hoje o chat usa o Supabase Postgres como banco principal de mensagens.

Isso significa que:

- cada mensagem recebida ou enviada vira uma linha em `public.chat_messages`;
- o volume cresce linearmente com o número de mensagens;
- o banco ainda é aceitável para operação inicial e volume moderado;
- se a feature crescer muito, o maior risco não é só o número de linhas, mas também:
  `indexes`, `jsonb metadata`, buscas por conversa, auditoria de erros e eventual armazenamento de mídia.

O ponto importante: no estado atual, o maior consumidor de espaço ainda tende a ser texto + índices, não mídia binária, porque o sistema salva metadados e corpo textual, não o arquivo do WhatsApp em si.

## Arquitetura Atual

### Tabelas principais

#### `public.whatsapp_instances`

Representa cada instância conectada da Evolution API.

Campos centrais:

- `id`
- `instance_name`
- `display_name`
- `status`
- `cliente_id`
- `usuario_id`
- `metadata`
- `created_at`
- `updated_at`

Uso lógico:

- identifica qual número/instância pertence a qual operação;
- serve de base para o isolamento de acesso por `instance_name`;
- é o elo entre sessão do usuário NGP e os dados do chat.

#### `public.chat_messages`

É a tabela principal do espelhamento de mensagens.

Campos centrais:

- `id`
- `instance_name`
- `evolution_message_id`
- `remote_jid`
- `phone_normalized`
- `from_me`
- `lead_id`
- `cliente_id`
- `body`
- `message_type`
- `ai_suggestion`
- `message_timestamp`
- `metadata`
- `created_at`

Uso lógico:

- cada linha representa uma mensagem do WhatsApp;
- `instance_name` delimita a instância da Evolution;
- `remote_jid` identifica a conversa;
- `lead_id` conecta a mensagem ao CRM comercial;
- `message_timestamp` representa a cronologia real da mensagem;
- `created_at` representa o momento de persistência no banco.

#### `public.system_logs`

Tabela de auditoria técnica.

Campos centrais:

- `scope`
- `source`
- `event`
- `severity`
- `instance_name`
- `evolution_message_id`
- `error_message`
- `payload`
- `created_at`

Uso lógico:

- registrar falhas assíncronas;
- auditar problemas de persistência;
- rastrear erros de webhook e envio.

## Fluxo de Dados

### 1. Envio de mensagem

1. O usuário do Comercial envia a mensagem pelo frontend.
2. O frontend chama `whatsapp-send`.
3. A Edge Function valida a sessão e a posse da instância.
4. A função chama a Evolution API.
5. Se a Evolution aceitar, a função tenta persistir a mensagem em `chat_messages`.
6. Se a persistência falhar, um evento é salvo em `system_logs`.

Consequência arquitetural:

- o banco é o histórico oficial do CRM;
- a Evolution é o canal de transporte;
- o frontend pode mostrar estado otimista, mas a verdade persistente está no Postgres.

### 2. Recebimento de mensagem

1. O cliente responde no WhatsApp.
2. A Evolution envia webhook `MESSAGES_UPSERT`.
3. O endpoint valida o segredo do webhook.
4. O webhook retorna `200` rapidamente.
5. O processamento assíncrono normaliza e tenta gravar em `chat_messages`.
6. Qualquer falha relevante vai para `system_logs`.

### 3. Importação de histórico

1. O frontend dispara `whatsapp-sync`.
2. A função chama `chat/findMessages` na Evolution.
3. Cada mensagem retornada faz `upsert` em `chat_messages`.

Uso:

- retroalimentar o CRM;
- recuperar mensagens antigas;
- repovoar o banco quando o webhook falhou em algum período.

## Como o Espaço em Banco Cresce

O crescimento mais importante hoje acontece em quatro blocos:

### 1. Linhas de `chat_messages`

Cada mensagem gera:

- uma linha da tabela;
- atualização de índices;
- armazenamento de `metadata jsonb`;
- eventual `ai_suggestion`.

Mesmo sem mídia binária, isso cresce rápido em volume alto.

### 2. Índices

Hoje já existem índices para:

- `lead_id`
- `phone_normalized`
- `instance_name + remote_jid + created_at`
- `instance_name + message_timestamp + created_at`

Em chat de alto volume, o índice pode consumir fração relevante do storage total.

### 3. `metadata` e `jsonb`

`jsonb` é útil, mas tende a crescer sem controle se começarmos a jogar payloads muito ricos ali dentro.

Risco típico:

- salvar dados desnecessários do WhatsApp;
- anexar payloads grandes em erro e auditoria;
- guardar campos repetidos que deveriam ser colunas normais.

### 4. `system_logs`

Se a auditoria virar “log bruto de tudo”, ela também cresce rápido.

Log deve ser útil para investigar, não um arquivo morto eterno dentro do banco primário.

## O Que Hoje Ainda Nao Esta Consumindo Muito

No desenho atual, o sistema nao parece armazenar:

- imagem binária;
- áudio binário;
- vídeo binário;
- documento binário do WhatsApp.

Hoje ele salva principalmente:

- texto;
- tipo da mensagem;
- metadados resumidos;
- sugestão de IA;
- chaves de correlação.

Isso é melhor do que subir binário direto no Postgres.

## Riscos Reais em Escala

### Escala 1: operação interna da NGP

Cenário:

- poucas instâncias;
- volume diário moderado;
- time interno usando o Comercial.

Risco:

- baixo a moderado;
- a arquitetura atual aguenta bem se houver higiene de índices e logs.

### Escala 2: múltiplos clientes usando a feature

Cenário:

- várias instâncias por cliente;
- histórico prolongado;
- aumento grande de conversas e consultas simultâneas.

Riscos:

- crescimento rápido de `chat_messages`;
- RLS mais cara por tabela grande;
- queries de listagem de conversa ficando pesadas;
- sincronização retroativa virando custo importante.

### Escala 3: produto de chat pesado

Cenário:

- milhares ou milhões de mensagens;
- alta simultaneidade;
- clientes esperando histórico completo e quase tempo real.

Riscos:

- banco primário vira gargalo operacional;
- índices ficam caros;
- backups ficam pesados;
- auditoria mistura dados quentes e frios;
- custo por storage e I/O começa a subir com força.

## Gargalos Estruturais da Arquitetura Atual

### 1. Banco transacional fazendo tudo

O mesmo Postgres está sendo usado para:

- persistência operacional;
- leitura de UI;
- segurança por RLS;
- auditoria de falhas;
- histórico potencialmente longo.

Isso é ótimo no começo, mas não é o desenho ideal para escala alta.

### 2. Tabela única de mensagens

Uma única tabela grande para tudo funciona no início.

Em escala maior, o normal é começar a pensar em:

- particionamento por data;
- arquivamento;
- camada de leitura especializada;
- retenção por cliente ou por plano.

### 3. Sugestão de IA acoplada ao recebimento

Gerar `ai_suggestion` no processamento de mensagem é útil, mas pode aumentar:

- latência de processamento;
- custo por mensagem;
- acoplamento entre entrada e enriquecimento.

Em escala, isso deveria migrar para processamento assíncrono desacoplado.

## Como Entender o Consumo Real Hoje

Estas consultas ajudam a enxergar o tamanho real do módulo.

### Tamanho total da tabela de mensagens

```sql
SELECT
  pg_size_pretty(pg_total_relation_size('public.chat_messages')) AS total_size,
  pg_size_pretty(pg_relation_size('public.chat_messages')) AS table_size,
  pg_size_pretty(pg_indexes_size('public.chat_messages')) AS indexes_size;
```

### Tamanho total da tabela de logs

```sql
SELECT
  pg_size_pretty(pg_total_relation_size('public.system_logs')) AS total_size,
  pg_size_pretty(pg_relation_size('public.system_logs')) AS table_size,
  pg_size_pretty(pg_indexes_size('public.system_logs')) AS indexes_size;
```

### Quantidade de mensagens por instância

```sql
SELECT
  instance_name,
  count(*) AS total_messages
FROM public.chat_messages
GROUP BY instance_name
ORDER BY total_messages DESC;
```

### Quantidade por tipo de mensagem

```sql
SELECT
  message_type,
  count(*) AS total
FROM public.chat_messages
GROUP BY message_type
ORDER BY total DESC;
```

### Crescimento por mês

```sql
SELECT
  date_trunc('month', created_at) AS month,
  count(*) AS total_messages
FROM public.chat_messages
GROUP BY 1
ORDER BY 1 DESC;
```

### Top conversas mais volumosas

```sql
SELECT
  instance_name,
  remote_jid,
  count(*) AS total_messages
FROM public.chat_messages
GROUP BY instance_name, remote_jid
ORDER BY total_messages DESC
LIMIT 50;
```

## Como Pensar em Escala

### Fase 1: organizar o banco atual

Objetivo:

- manter a arquitetura atual, mas com disciplina.

Recomendações:

- limitar `metadata` ao essencial;
- não guardar payload bruto completo do WhatsApp em `chat_messages`;
- não guardar mídia binária no Postgres;
- criar política de retenção para `system_logs`;
- monitorar crescimento de índices;
- revisar queries de listagem com `EXPLAIN ANALYZE`.

### Fase 2: separar dado quente de dado frio

Objetivo:

- manter rápida a operação do Comercial.

Recomendações:

- manter no banco primário só mensagens recentes, por exemplo 90 a 180 dias;
- arquivar histórico antigo em tabela fria ou storage analítico;
- expor o histórico antigo sob demanda, não em toda listagem padrão;
- separar logs operacionais recentes de logs históricos.

### Fase 3: particionar mensagens

Objetivo:

- evitar que uma tabela única gigante vire gargalo.

Estratégias:

- particionar `chat_messages` por mês;
- ou particionar por data com retenção automática;
- manter índices menores por partição;
- facilitar purge e archive.

Bom momento para fazer isso:

- quando a tabela começar a acumular volume grande por mês;
- quando queries e manutenção começarem a degradar visivelmente.

### Fase 4: tratar mídia como storage, não como banco

Objetivo:

- impedir explosão de custo e tamanho.

Desenho recomendado:

- Postgres guarda só referência:
  `media_url`, `mime_type`, `sha256`, `size_bytes`, `thumbnail_url`;
- arquivo real vai para object storage;
- políticas de expiração e lifecycle ficam no storage, não na tabela principal.

### Fase 5: desacoplar enriquecimento

Objetivo:

- o recebimento da mensagem não depender de IA e tarefas pesadas.

Desenho recomendado:

- webhook grava mensagem;
- fila assíncrona agenda enriquecimento;
- worker gera `ai_suggestion`, baixa mídia, indexa busca ou faz outras tarefas.

Isso reduz risco operacional.

## Modelo Recomendado Para Clientes em Escala

Se o chat virar feature comercial para clientes, eu recomendaria este desenho:

### Camada transacional

Responsável por:

- mensagens recentes;
- estado operacional do chat;
- vínculo com CRM;
- controle de instâncias;
- RLS e segurança.

### Camada de storage de mídia

Responsável por:

- imagens;
- áudios;
- vídeos;
- documentos;
- thumbnails.

### Camada assíncrona

Responsável por:

- IA;
- reconciliação;
- retentativa;
- importação retroativa;
- auditoria técnica.

### Camada de histórico frio

Responsável por:

- retenção longa;
- relatórios;
- consultas não operacionais;
- reidratação de histórico antigo.

## Política de Retenção Recomendada

Uma proposta pragmática:

### `chat_messages`

- manter histórico recente no banco quente;
- arquivar o restante por janela temporal;
- definir política por contrato ou plano do cliente.

### `system_logs`

- manter logs críticos recentes no banco;
- expirar logs verbosos;
- mover incidentes relevantes para ferramenta de observabilidade se necessário.

### `metadata`

- guardar só o que é útil para operação e reconciliação;
- evitar crescimento livre de JSON.

## O Que Eu Faria Agora no NGP Space

Prioridade alta:

1. medir o tamanho real de `chat_messages` e `system_logs`;
2. contar mensagens por instância e por mês;
3. definir política de retenção para logs;
4. decidir se o produto vai guardar histórico total ou janela operacional.

Prioridade média:

1. preparar colunas de mídia por referência, sem binário;
2. separar enriquecimento por IA do caminho crítico;
3. pensar em arquivamento por data.

Prioridade de escala:

1. particionamento;
2. storage externo para mídia;
3. fila assíncrona para processamento pesado;
4. histórico frio separado do banco operacional.

## Conclusão

A arquitetura atual é boa para começo e para operação moderada, especialmente porque ainda não está salvando mídia binária no Postgres.

O risco de escala está menos em “uma mensagem ocupa muito” e mais em:

- crescimento contínuo de `chat_messages`;
- custo dos índices;
- `jsonb` sem disciplina;
- logs sem retenção;
- histórico longo misturado com operação diária.

Se essa feature virar produto para clientes, o caminho mais saudável é:

- manter o Postgres como camada operacional;
- guardar mídia fora do banco;
- tratar histórico antigo como dado frio;
- desacoplar tarefas pesadas do webhook;
- governar retenção desde cedo.
