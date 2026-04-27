// ─────────────────────────────────────────────────────────────────────────────
// Tipos do módulo Gestão de Tarefas
// Migrations: 20260427120000_tasks_module + 20260427130000_task_setores
// ─────────────────────────────────────────────────────────────────────────────

export type TaskStatus   = 'backlog' | 'todo' | 'doing' | 'review' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high'

// ── Setor (configurável pelo admin) ──────────────────────────────────────────

export interface TaskSetor {
  id:         string
  created_at: string
  nome:       string
  cor:        string
  ordem:      number
  ativo:      boolean
  client_id?: string | null
}

export interface TaskSetorPayload {
  nome:  string
  cor:   string
  ordem: number
  ativo: boolean
}

// ── Cliente (join de usuarios WHERE role = 'cliente') ────────────────────────

export interface TaskCliente {
  id:       string
  nome:     string
  username: string
  foto_url?: string | null
}

// ── Colaborador (join de usuarios, qualquer role) ────────────────────────────

export interface TaskAssignee {
  id:       string
  nome:     string
  foto_url?: string | null
}

// ── Tarefa ───────────────────────────────────────────────────────────────────

export interface Task {
  id:          string
  created_at:  string
  updated_at:  string
  title:       string
  description: string | null
  status:      TaskStatus
  priority:    TaskPriority
  assigned_to: string | null
  due_date:    string | null
  created_by:  string | null
  client_id:   string | null
  setor_id:    string | null
  // joins opcionais — preenchidos quando a query traz os dados relacionados
  assignee?:   TaskAssignee | null
  cliente?:    TaskCliente  | null
  setor?:      TaskSetor    | null
}

export interface TaskCreatePayload {
  title:        string
  description?: string
  status:       TaskStatus
  priority:     TaskPriority
  assigned_to?: string | null
  due_date?:    string | null
  client_id?:   string | null
  setor_id?:    string | null
}

export interface TaskUpdatePayload extends Partial<TaskCreatePayload> {
  id: string
}

// ── Filtros ativos na tela ────────────────────────────────────────────────────

export interface TaskFilters {
  client_id?:   string
  setor_id?:    string
  assigned_to?: string
  status?:      TaskStatus
  search?:      string
}

// ── Metadados visuais (fonte única de verdade para labels e cores) ────────────

export const TASK_STATUS_META: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  backlog: { label: 'Backlog',       color: '#64748b', bg: '#f1f5f9' },
  todo:    { label: 'A fazer',       color: '#0f172a', bg: '#e2e8f0' },
  doing:   { label: 'Em andamento',  color: '#1d4ed8', bg: '#dbeafe' },
  review:  { label: 'Revisão',       color: '#7c3aed', bg: '#ede9fe' },
  done:    { label: 'Concluído',     color: '#15803d', bg: '#dcfce7' },
}

export const TASK_PRIORITY_META: Record<TaskPriority, { label: string; color: string; bg: string; border: string }> = {
  low:    { label: 'Baixa', color: '#64748b', bg: '#f8fafc', border: '#cbd5e1' },
  medium: { label: 'Média', color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  high:   { label: 'Alta',  color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
}

export const TASK_COLUMNS: TaskStatus[] = ['backlog', 'todo', 'doing', 'review', 'done']
