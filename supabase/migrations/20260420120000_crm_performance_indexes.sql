-- Índices compostos para acelerar o carregamento do pipeline comercial.
-- Todos IF NOT EXISTS para ser idempotente em ambientes com schema parcial.

CREATE INDEX IF NOT EXISTS crm_leads_stage_position_idx
  ON crm_leads (stage_id, position);

CREATE INDEX IF NOT EXISTS crm_tasks_lead_status_due_idx
  ON crm_tasks (lead_id, status, due_date);

CREATE INDEX IF NOT EXISTS crm_tasks_status_due_idx
  ON crm_tasks (status, due_date)
  WHERE status = 'pendente';

CREATE INDEX IF NOT EXISTS crm_tasks_assigned_status_due_idx
  ON crm_tasks (assigned_to, status, due_date);

CREATE INDEX IF NOT EXISTS crm_activities_lead_created_idx
  ON crm_activities (lead_id, created_at DESC);
