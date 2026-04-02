export const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL!
export const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON!

export const PERIOD_MAP: Record<string, string> = {
  today: 'today',
  yesterday: 'yesterday',
  last7: 'last_7d',
  last30: 'last_30d',
  thismonth: 'this_month',
  lastmonth: 'last_month',
  last90: 'last_90d',
}

export const PERIOD_LABELS: Record<string, string> = {
  today: 'Hoje',
  yesterday: 'Ontem',
  last7: 'Últimos 7 dias',
  last30: 'Últimos 30 dias',
  thismonth: 'Este mês',
  lastmonth: 'Mês anterior',
  last90: 'Últimos 90 dias',
}

export const BG_COLORS = [
  '135deg,#3b82f6,#7c3aed',
  '135deg,#059669,#14b8a6',
  '135deg,#dc2626,#f97316',
  '135deg,#7c3aed,#ec4899',
  '135deg,#0891b2,#3b82f6',
  '135deg,#16a34a,#65a30d',
  '135deg,#ea580c,#f59e0b',
  '135deg,#be185d,#7c3aed',
]
