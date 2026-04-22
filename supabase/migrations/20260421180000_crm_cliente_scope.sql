ALTER TABLE public.crm_pipelines
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS crm_pipelines_cliente_idx
  ON public.crm_pipelines (cliente_id, is_active, created_at);
