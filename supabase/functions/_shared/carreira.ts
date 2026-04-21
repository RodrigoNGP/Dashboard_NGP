export const BRASILIA_OFFSET_MS = -3 * 60 * 60 * 1000

export interface PontoRecord {
  usuario_id: string
  tipo_registro: string
  created_at: string
}

export function isOfficialEmailLogin(username?: string | null): boolean {
  if (!username) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)
}

function toBrasiliaShiftedDate(date: Date): Date {
  return new Date(date.getTime() + BRASILIA_OFFSET_MS)
}

function formatBrasiliaDate(date: Date): string {
  return toBrasiliaShiftedDate(date).toISOString().split('T')[0]
}

function localMidnightUtc(dateStr: string): string {
  return `${dateStr}T03:00:00.000Z`
}

export function getMonthRangeUtc(now = new Date()): { startUtc: string; endUtc: string } {
  const localNow = toBrasiliaShiftedDate(now)
  const year = localNow.getUTCFullYear()
  const month = localNow.getUTCMonth()

  const startLocal = new Date(Date.UTC(year, month, 1, 0, 0, 0))
  const nextMonthLocal = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0))

  return {
    startUtc: localMidnightUtc(formatBrasiliaDate(startLocal)),
    endUtc: localMidnightUtc(formatBrasiliaDate(nextMonthLocal)),
  }
}

export function getWeekRangeUtc(now = new Date()): { startUtc: string; endUtc: string } {
  const localNow = toBrasiliaShiftedDate(now)
  const dayOfWeek = localNow.getUTCDay() // 0 = domingo
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek

  const startLocal = new Date(Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate() + diffToMonday,
    0,
    0,
    0,
  ))
  const nextWeekLocal = new Date(startLocal.getTime() + 7 * 24 * 60 * 60 * 1000)

  return {
    startUtc: localMidnightUtc(formatBrasiliaDate(startLocal)),
    endUtc: localMidnightUtc(formatBrasiliaDate(nextWeekLocal)),
  }
}

export function sumWorkedMinutesByUser(records: PontoRecord[]): Record<string, number> {
  const groups: Record<string, PontoRecord[]> = {}

  for (const record of records) {
    const localDate = formatBrasiliaDate(new Date(record.created_at))
    const key = `${record.usuario_id}__${localDate}`
    if (!groups[key]) groups[key] = []
    groups[key].push(record)
  }

  const totals: Record<string, number> = {}

  for (const groupRecords of Object.values(groups)) {
    const totalMins = calcWorkedMinutes(groupRecords)
    const userId = groupRecords[0]?.usuario_id
    if (!userId) continue
    totals[userId] = (totals[userId] || 0) + totalMins
  }

  return totals
}

export function calcWorkedMinutes(records: Array<{ tipo_registro: string; created_at: string }>): number {
  const sorted = [...records].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const isEntry = (tipo: string) => ['entrada', 'retorno_almoco', 'extra_entrada'].includes(tipo)
  const isExit = (tipo: string) => ['saida_almoco', 'saida', 'extra_saida'].includes(tipo)

  let totalMs = 0
  let entryTime: number | null = null

  for (const record of sorted) {
    if (isEntry(record.tipo_registro)) {
      entryTime = new Date(record.created_at).getTime()
      continue
    }

    if (isExit(record.tipo_registro) && entryTime) {
      totalMs += new Date(record.created_at).getTime() - entryTime
      entryTime = null
    }
  }

  return Math.floor(totalMs / 60000)
}

