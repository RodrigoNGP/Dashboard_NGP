import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface CrmScopedUser {
  id: string;
  role: "admin" | "ngp" | "cliente";
  nome: string | null;
}

export interface CrmScope {
  user: CrmScopedUser;
  clienteId: string | null;
}

export async function resolveCrmScope(
  sb: SupabaseClient,
  sessionToken: string,
  requestedClienteId?: string | null,
): Promise<CrmScope | null> {
  const { data: sessao } = await sb
    .from("sessions")
    .select("usuario_id")
    .eq("token", sessionToken)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (!sessao?.usuario_id) return null;

  const { data: usuario } = await sb
    .from("usuarios")
    .select("id, role, nome")
    .eq("id", sessao.usuario_id)
    .single();

  if (!usuario || !["admin", "ngp", "cliente"].includes(usuario.role)) return null;

  if (usuario.role === "cliente") {
    return {
      user: usuario as CrmScopedUser,
      clienteId: usuario.id,
    };
  }

  return {
    user: usuario as CrmScopedUser,
    clienteId: requestedClienteId?.trim() || null,
  };
}

export function applyPipelineScope<T extends { eq: Function; is: Function }>(
  query: T,
  clienteId: string | null,
) {
  return clienteId ? query.eq("cliente_id", clienteId) : query.is("cliente_id", null);
}

export async function getScopedPipeline(
  sb: SupabaseClient,
  pipelineId: string,
  clienteId: string | null,
) {
  let query = sb
    .from("crm_pipelines")
    .select("id, cliente_id, name")
    .eq("id", pipelineId);

  query = clienteId ? query.eq("cliente_id", clienteId) : query.is("cliente_id", null);

  const { data } = await query.single();
  return data || null;
}

export async function getScopedStage(
  sb: SupabaseClient,
  stageId: string,
  clienteId: string | null,
) {
  const { data: stage } = await sb
    .from("crm_pipeline_stages")
    .select("id, pipeline_id, name, position, color")
    .eq("id", stageId)
    .single();

  if (!stage) return null;

  const pipeline = await getScopedPipeline(sb, stage.pipeline_id, clienteId);
  if (!pipeline) return null;

  return { ...stage, pipeline };
}

export async function getScopedLead(
  sb: SupabaseClient,
  leadId: string,
  clienteId: string | null,
) {
  const { data: lead } = await sb
    .from("crm_leads")
    .select("id, pipeline_id, stage_id, company_name, position")
    .eq("id", leadId)
    .single();

  if (!lead) return null;

  const pipeline = await getScopedPipeline(sb, lead.pipeline_id, clienteId);
  if (!pipeline) return null;

  return { ...lead, pipeline };
}

export async function getScopedTask(
  sb: SupabaseClient,
  taskId: string,
  clienteId: string | null,
) {
  const { data: task } = await sb
    .from("crm_tasks")
    .select("id, lead_id, assigned_to, assigned_to_name, title")
    .eq("id", taskId)
    .single();

  if (!task) return null;

  const lead = await getScopedLead(sb, task.lead_id, clienteId);
  if (!lead) return null;

  return { ...task, lead };
}
