ALTER TABLE carreira_reunioes
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS apresentado_em timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'carreira_reunioes_status_check'
  ) THEN
    ALTER TABLE carreira_reunioes
      ADD CONSTRAINT carreira_reunioes_status_check
      CHECK (status IN ('pendente', 'apresentado'));
  END IF;
END $$;

UPDATE carreira_reunioes
SET status = COALESCE(status, 'pendente')
WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS idx_carreira_reunioes_usuario_status_data
  ON carreira_reunioes (usuario_id, status, data_reuniao DESC, created_at DESC);
