ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS cargo text,
  ADD COLUMN IF NOT EXISTS funcao text,
  ADD COLUMN IF NOT EXISTS senioridade text,
  ADD COLUMN IF NOT EXISTS gestor_usuario text,
  ADD COLUMN IF NOT EXISTS objetivo_profissional_resumo text;

CREATE INDEX IF NOT EXISTS idx_usuarios_funcao ON usuarios (funcao);
CREATE INDEX IF NOT EXISTS idx_usuarios_cargo ON usuarios (cargo);
CREATE INDEX IF NOT EXISTS idx_usuarios_senioridade ON usuarios (senioridade);
CREATE INDEX IF NOT EXISTS idx_usuarios_gestor_usuario ON usuarios (gestor_usuario);

CREATE TABLE IF NOT EXISTS carreira_reunioes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  data_reuniao date NOT NULL,
  titulo text,
  pontos_fortes text,
  pontos_melhoria text,
  swot_forcas text,
  swot_fraquezas text,
  swot_oportunidades text,
  swot_ameacas text,
  objetivos_pessoais text,
  apoio_ngp text,
  combinados_proximo_ciclo text,
  notas_livres text,
  status text NOT NULL DEFAULT 'pendente',
  apresentado_em timestamptz,
  created_by uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE carreira_reunioes
  ADD CONSTRAINT carreira_reunioes_status_check
  CHECK (status IN ('pendente', 'apresentado'));

CREATE INDEX IF NOT EXISTS idx_carreira_reunioes_usuario_data
  ON carreira_reunioes (usuario_id, data_reuniao DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_carreira_reunioes_created_by
  ON carreira_reunioes (created_by);

CREATE INDEX IF NOT EXISTS idx_carreira_reunioes_updated_by
  ON carreira_reunioes (updated_by);

ALTER TABLE carreira_reunioes ENABLE ROW LEVEL SECURITY;
