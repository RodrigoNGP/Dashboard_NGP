-- ── Tabela: whatsapp_instances ────────────────────────────────────────────────
-- Registra instâncias da Evolution API conectadas ao sistema NGP
CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_name text NOT NULL UNIQUE,
  display_name  text,
  status        text NOT NULL DEFAULT 'disconnected',
  -- NULL = NGP-interno (padrão do sistema de escopo)
  cliente_id    uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  metadata      jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_instances_cliente_idx
  ON public.whatsapp_instances (cliente_id, status);

-- ── Tabela: chat_messages ─────────────────────────────────────────────────────
-- Mensagens espelhadas do WhatsApp via Evolution API
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_name         text NOT NULL,
  -- ID único da mensagem na Evolution (para idempotência)
  evolution_message_id  text NOT NULL,
  remote_jid            text NOT NULL,  -- ex: 5511999999999@s.whatsapp.net
  phone_normalized      text,           -- ex: 5511999999999 (E.164 sem +)
  from_me               boolean NOT NULL DEFAULT false,
  -- Vínculo com lead (nullable - número pode não ter lead)
  lead_id               uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  -- NULL = NGP-interno
  cliente_id            uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  body                  text,
  message_type          text NOT NULL DEFAULT 'conversation',
  -- Sugestão gerada pela IA (SPIN Selling / AIDA)
  ai_suggestion         text,
  -- Timestamp original da mensagem (Unix epoch em segundos, convertido)
  message_timestamp     timestamptz,
  metadata              jsonb NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),

  -- Idempotência: mesma mensagem não entra duas vezes
  CONSTRAINT chat_messages_evolution_unique UNIQUE (instance_name, evolution_message_id)
);

CREATE INDEX IF NOT EXISTS chat_messages_lead_idx
  ON public.chat_messages (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_messages_phone_idx
  ON public.chat_messages (phone_normalized, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_messages_instance_jid_idx
  ON public.chat_messages (instance_name, remote_jid, created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages      ENABLE ROW LEVEL SECURITY;

-- Apenas usuários NGP/admin podem ler instâncias e mensagens internas
CREATE POLICY "ngp_read_whatsapp_instances" ON public.whatsapp_instances
  FOR SELECT USING (cliente_id IS NULL);

CREATE POLICY "ngp_read_chat_messages" ON public.chat_messages
  FOR SELECT USING (cliente_id IS NULL);

-- ── Realtime ──────────────────────────────────────────────────────────────────
-- Necessário para o frontend receber mensagens em tempo real
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
