-- ─────────────────────────────────────────────────────────────────────────────
-- Módulo: Ponto Eletrônico NGP
-- Tabela: ponto_registros
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ponto_registros (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id      UUID        NOT NULL,
  -- created_at é imutável: gerado pelo servidor via DEFAULT now(), NUNCA alterado
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  tipo_registro   TEXT        NOT NULL,
  hash_validacao  TEXT,
  ip_address      TEXT,
  device_info     JSONB,

  CONSTRAINT ponto_tipo_valido CHECK (
    tipo_registro IN ('entrada', 'saida_almoco', 'retorno_almoco', 'saida', 'extra')
  ),
  CONSTRAINT fk_ponto_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE
);

-- Índices para consultas por usuário e por data
CREATE INDEX IF NOT EXISTS idx_ponto_usuario_id   ON ponto_registros(usuario_id);
CREATE INDEX IF NOT EXISTS idx_ponto_created_at   ON ponto_registros(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ponto_usuario_date ON ponto_registros(usuario_id, created_at DESC);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Todo acesso ao dado ocorre via Edge Functions com service_role_key,
-- que bypassa RLS. Habilitamos RLS como camada extra de segurança:
-- nenhum cliente direto da anon key pode ler/escrever ponto_registros.

ALTER TABLE ponto_registros ENABLE ROW LEVEL SECURITY;

-- Sem políticas abertas ao público: somente service_role tem acesso.
-- (service_role bypassa todas as políticas de RLS automaticamente)
