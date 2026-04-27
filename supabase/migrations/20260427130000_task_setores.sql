-- ─────────────────────────────────────────────────────────────────────────────
-- Módulo: Gestão de Tarefas — Setores configuráveis
-- ─────────────────────────────────────────────────────────────────────────────

-- Tabela de setores (configurável por admin)
CREATE TABLE IF NOT EXISTS task_setores (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  nome       text        NOT NULL,
  cor        text        NOT NULL DEFAULT '#3b82f6',
  ordem      integer     NOT NULL DEFAULT 0,
  ativo      boolean     NOT NULL DEFAULT true
);

-- Índice para listagem ordenada
CREATE INDEX IF NOT EXISTS idx_task_setores_ordem ON task_setores (ordem, nome);

-- RLS
ALTER TABLE task_setores ENABLE ROW LEVEL SECURITY;

-- Qualquer autenticado lê
CREATE POLICY "task_setores_select"
  ON task_setores FOR SELECT
  TO authenticated
  USING (true);

-- Apenas admin insere / atualiza / deleta
-- (verificamos role via join com usuarios — mesma abordagem do restante do sistema)
CREATE POLICY "task_setores_insert_admin"
  ON task_setores FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      JOIN sessions s ON s.usuario_id = u.id
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

CREATE POLICY "task_setores_update_admin"
  ON task_setores FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

CREATE POLICY "task_setores_delete_admin"
  ON task_setores FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- Setores padrão para o dia 1 (admin pode editar/remover depois)
INSERT INTO task_setores (nome, cor, ordem) VALUES
  ('Atendimento',  '#3b82f6', 1),
  ('Tráfego Pago', '#f59e0b', 2),
  ('Automação',    '#7c3aed', 3),
  ('Estratégico',  '#059669', 4),
  ('Interno',      '#64748b', 5);

-- ─────────────────────────────────────────────────────────────────────────────
-- Patch na tabela tasks: adiciona client_id e setor_id
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS setor_id  uuid REFERENCES task_setores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_client_id ON tasks (client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_setor_id  ON tasks (setor_id);
