-- Funções SQL para reposicionamento em batch de leads (elimina N+1).

-- Desloca +1 em todos os leads de um stage cuja position >= threshold.
CREATE OR REPLACE FUNCTION crm_shift_stage_positions(
  p_stage_id uuid,
  p_threshold int DEFAULT 0,
  p_exclude_lead_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE sql
AS $$
  UPDATE crm_leads
     SET position = position + 1
   WHERE stage_id = p_stage_id
     AND position >= p_threshold
     AND (p_exclude_lead_id IS NULL OR id <> p_exclude_lead_id);
$$;

-- Reenumera posições (0..N-1) de um stage pela ordem atual de position/created_at.
CREATE OR REPLACE FUNCTION crm_compact_stage_positions(
  p_stage_id uuid,
  p_exclude_lead_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE sql
AS $$
  WITH ordered AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY position, created_at) - 1 AS new_pos
      FROM crm_leads
     WHERE stage_id = p_stage_id
       AND (p_exclude_lead_id IS NULL OR id <> p_exclude_lead_id)
  )
  UPDATE crm_leads l
     SET position = o.new_pos
    FROM ordered o
   WHERE l.id = o.id
     AND l.position IS DISTINCT FROM o.new_pos;
$$;
