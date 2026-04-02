export const fmt = (n: number, d = 2) =>
  Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })

export const fmtN = (n: number) => parseInt(String(n || 0)).toLocaleString('pt-BR')

export const fmtI = (n: number) => {
  n = parseInt(String(n || 0))
  return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n)
}

export const esc = (s: unknown) =>
  s == null
    ? ''
    : String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')

export function parseIns(ins: Record<string, unknown>) {
  if (!ins) return null
  const actions = (ins.actions as { action_type: string; value: string }[]) || []
  const av = (ins.action_values as { action_type: string; value: string }[]) || []
  const spend = parseFloat(String(ins.spend || 0))
  const purVal = parseFloat(av.find((a) => a.action_type === 'purchase')?.value || '0')
  const roasArr = (ins.purchase_roas as { value: string }[]) || []
  let roas = roasArr.length ? parseFloat(roasArr[0].value) : 0
  if (!roas && purVal > 0 && spend > 0) roas = purVal / spend
  return {
    spend,
    impressions: parseInt(String(ins.impressions || 0)),
    clicks: parseInt(String(ins.clicks || 0)),
    ctr: parseFloat(String(ins.ctr || 0)),
    cpc: parseFloat(String(ins.cpc || 0)),
    reach: parseInt(String(ins.reach || 0)),
    conversations: Math.round(
      parseFloat(
        actions.find(
          (a) =>
            a.action_type?.includes('messaging_conversation_started') ||
            a.action_type?.includes('total_messaging')
        )?.value || '0'
      )
    ),
    leads: Math.round(
      parseFloat(
        actions.find((a) => a.action_type === 'lead' || a.action_type === 'leadgen_grouped')?.value || '0'
      )
    ),
    purchases: Math.round(
      parseFloat(actions.find((a) => a.action_type === 'purchase')?.value || '0')
    ),
    purchaseValue: purVal,
    roas: parseFloat(roas.toFixed(2)),
  }
}
