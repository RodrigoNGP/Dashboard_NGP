-- ─────────────────────────────────────────────────────────────────────────────
-- Módulo: Gestão de Tarefas
-- Tabela: tasks
-- Nota: assigned_to referencia usuarios(id) — mesma tabela usada por Pessoas
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE task_status AS ENUM ('backlog', 'todo', 'doing', 'review', 'done');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high');

CREATE TABLE IF NOT EXISTS tasks (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  title        text        NOT NULL,
  description  text,
  status       task_status NOT NULL DEFAULT 'backlog',
  priority     task_priority NOT NULL DEFAULT 'medium',
  assigned_to  uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  due_date     timestamptz,
  created_by   uuid        REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION tasks_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION tasks_set_updated_at();

-- Índices para as queries mais comuns
CREATE INDEX IF NOT EXISTS idx_tasks_status       ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to  ON tasks (assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date     ON tasks (due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by   ON tasks (created_by);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Apenas usuários autenticados podem ler tarefas
CREATE POLICY "tasks_select_authenticated"
  ON tasks FOR SELECT
  TO authenticated
  USING (true);

-- Apenas usuários autenticados podem inserir tarefas
CREATE POLICY "tasks_insert_authenticated"
  ON tasks FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Apenas usuários autenticados podem atualizar tarefas
CREATE POLICY "tasks_update_authenticated"
  ON tasks FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Apenas usuários autenticados podem deletar tarefas
CREATE POLICY "tasks_delete_authenticated"
  ON tasks FOR DELETE
  TO authenticated
  USING (true);
