CREATE OR REPLACE FUNCTION public.find_crm_lead_by_phone(p_phone text)
RETURNS TABLE (
  id uuid,
  company_name text,
  contact_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH normalized_input AS (
    SELECT regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g') AS phone_digits
  )
  SELECT
    lead.id,
    lead.company_name,
    lead.contact_name
  FROM public.crm_leads lead
  CROSS JOIN normalized_input input
  WHERE input.phone_digits <> ''
    AND regexp_replace(COALESCE(lead.phone, ''), '[^0-9]', '', 'g') <> ''
    AND (
      input.phone_digits LIKE '%' || regexp_replace(COALESCE(lead.phone, ''), '[^0-9]', '', 'g')
      OR regexp_replace(COALESCE(lead.phone, ''), '[^0-9]', '', 'g') LIKE '%' || input.phone_digits
    )
  ORDER BY
    length(regexp_replace(COALESCE(lead.phone, ''), '[^0-9]', '', 'g')) DESC,
    lead.updated_at DESC,
    lead.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_crm_lead_by_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_crm_lead_by_phone(text) TO service_role;
