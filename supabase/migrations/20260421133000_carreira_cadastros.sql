CREATE TABLE IF NOT EXISTS carreira_cadastros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('cargo', 'funcao', 'senioridade')),
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_carreira_cadastros_tipo_nome_unique
  ON carreira_cadastros (tipo, lower(nome));

CREATE INDEX IF NOT EXISTS idx_carreira_cadastros_tipo_ativo_nome
  ON carreira_cadastros (tipo, ativo, nome);

ALTER TABLE carreira_cadastros ENABLE ROW LEVEL SECURITY;
