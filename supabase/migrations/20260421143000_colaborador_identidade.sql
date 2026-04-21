ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS setor text,
  ADD COLUMN IF NOT EXISTS data_entrada date;

CREATE INDEX IF NOT EXISTS idx_usuarios_setor ON usuarios (setor);
CREATE INDEX IF NOT EXISTS idx_usuarios_data_entrada ON usuarios (data_entrada);
