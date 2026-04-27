CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  schema_version integer NOT NULL DEFAULT 1,
  cliente_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  cliente_username text,
  cliente_nome text,
  meta_account_id text NOT NULL,
  period_label text NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_snapshots_actor_scope
  ON analytics_snapshots (created_by, source, meta_account_id, period_label);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_client_created
  ON analytics_snapshots (cliente_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_account_created
  ON analytics_snapshots (meta_account_id, created_at DESC);

ALTER TABLE analytics_snapshots ENABLE ROW LEVEL SECURITY;

ALTER TABLE ai_analysis_runs
  ADD COLUMN IF NOT EXISTS snapshot_id uuid REFERENCES analytics_snapshots(id) ON DELETE SET NULL;

ALTER TABLE ai_analysis_runs
  ADD COLUMN IF NOT EXISTS output_json jsonb;

CREATE INDEX IF NOT EXISTS idx_ai_analysis_runs_snapshot
  ON ai_analysis_runs (snapshot_id);
