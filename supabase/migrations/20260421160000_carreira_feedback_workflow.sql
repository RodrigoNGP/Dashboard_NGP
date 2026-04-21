UPDATE carreira_reunioes
SET status = CASE
  WHEN status = 'pendente' THEN 'agendado'
  WHEN status = 'apresentado' THEN 'publicado'
  ELSE status
END
WHERE status IN ('pendente', 'apresentado');

ALTER TABLE carreira_reunioes
  DROP CONSTRAINT IF EXISTS carreira_reunioes_status_check;

ALTER TABLE carreira_reunioes
  ADD CONSTRAINT carreira_reunioes_status_check
  CHECK (status IN ('anotado', 'agendado', 'publicado'));

ALTER TABLE carreira_reunioes
  ALTER COLUMN status SET DEFAULT 'anotado';

UPDATE carreira_reunioes
SET status = 'anotado'
WHERE status IS NULL;
