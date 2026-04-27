import type { DateParam } from '../types'

export type AnalysisTone = 'good' | 'warn' | 'bad' | 'neutral'
export type AnalysisPriority = 'high' | 'medium' | 'low'
export type AnalysisConfidence = 'high' | 'medium' | 'low'

export interface AnalyticsSnapshotClient {
  id: string | null
  name: string
  username: string
  metaAccountId: string
}

export interface AnalyticsSnapshotPeriod {
  label: string
  current: DateParam
  comparisonLabel: string | null
  comparison: DateParam | null
}

export interface AnalyticsSnapshotSummary {
  spend: number
  revenue: number
  roas: number
  cpc: number
  cpm: number
  costPerResult: number
  primaryResultLabel: string
  primaryResults: number
  conversations: number
  leads: number
  purchases: number
  impressions: number
  clicks: number
  ctr: number
  reach: number
  frequency: number
  conversionRate: number
  campaignCount: number
  filteredCampaignCount: number
  monthlyAuthorizedBudget: number
  periodAuthorizedBudget: number
  budgetBalance: number
  budgetUsagePercent: number
}

export interface AnalyticsSnapshotComparison {
  spend: number
  revenue: number
  roas: number
  cpc: number
  cpm: number
  costPerResult: number
  primaryResults: number
  ctr: number
  frequency: number
  conversionRate: number
  deltas: {
    spend: number | null
    primaryResults: number | null
    ctr: number | null
    cpc: number | null
    frequency: number | null
    roas: number | null
    conversionRate: number | null
  }
}

export interface AnalyticsSnapshotSignal {
  title: string
  value: string
  detail: string
  tone: AnalysisTone
}

export interface AnalyticsSnapshotCampaign {
  id: string
  name: string
  status: string
  spendRank: number
  spend: number
  spendShare: number
  impressions: number
  clicks: number
  ctr: number
  cpc: number
  reach: number
  conversations: number
  leads: number
  purchases: number
  primaryResults: number
  primaryResultLabel: string
  costPerResult: number | null
  roas: number
  revenue: number
}

export interface AnalyticsSnapshotCreative {
  id: string
  name: string
  status: string
  spendRank: number
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpc: number | null
}

export interface AnalyticsSnapshot {
  schemaVersion: number
  source: 'dashboard_meta_ads'
  generatedAt: string
  client: AnalyticsSnapshotClient
  period: AnalyticsSnapshotPeriod
  summary: AnalyticsSnapshotSummary
  comparison: AnalyticsSnapshotComparison | null
  diagnosis: {
    headline: string
    signals: AnalyticsSnapshotSignal[]
  }
  campaigns: AnalyticsSnapshotCampaign[]
  creatives: AnalyticsSnapshotCreative[]
  filters: {
    selectedCampaignIds: string[]
  }
}

export interface StructuredAnalysisAction {
  title: string
  detail: string
  priority: AnalysisPriority
}

export interface StructuredAnalysisResult {
  version: 1
  headline: string
  diagnosis: string
  wins: string[]
  risks: string[]
  opportunities: string[]
  nextActions: StructuredAnalysisAction[]
  dataGaps: string[]
  confidence: AnalysisConfidence
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
}

function asPriority(value: unknown): AnalysisPriority {
  if (value === 'high' || value === 'medium' || value === 'low') return value
  return 'medium'
}

function asConfidence(value: unknown): AnalysisConfidence {
  if (value === 'high' || value === 'medium' || value === 'low') return value
  return 'medium'
}

export function parseStructuredAnalysis(value: unknown): StructuredAnalysisResult | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const headline = String(source.headline || '').trim()
  const diagnosis = String(source.diagnosis || '').trim()
  if (!headline || !diagnosis) return null

  const rawActions = Array.isArray(source.nextActions) ? source.nextActions : []
  const nextActions = rawActions
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const action = item as Record<string, unknown>
      const title = String(action.title || '').trim()
      const detail = String(action.detail || '').trim()
      if (!title || !detail) return null
      return {
        title,
        detail,
        priority: asPriority(action.priority),
      }
    })
    .filter((item): item is StructuredAnalysisAction => item !== null)

  return {
    version: 1,
    headline,
    diagnosis,
    wins: asStringArray(source.wins),
    risks: asStringArray(source.risks),
    opportunities: asStringArray(source.opportunities),
    nextActions,
    dataGaps: asStringArray(source.dataGaps),
    confidence: asConfidence(source.confidence),
  }
}

export function renderStructuredAnalysisMarkdown(result: StructuredAnalysisResult): string {
  const sections: string[] = [
    `# ${result.headline}`,
    '',
    result.diagnosis,
  ]

  const listSection = (title: string, items: string[]) => {
    if (!items.length) return
    sections.push('', `## ${title}`)
    items.forEach((item) => sections.push(`- ${item}`))
  }

  listSection('O que está funcionando', result.wins)
  listSection('Riscos e desperdícios', result.risks)
  listSection('Oportunidades', result.opportunities)

  if (result.nextActions.length) {
    sections.push('', '## Próximas ações')
    result.nextActions.forEach((action) => {
      sections.push(`- [${action.priority.toUpperCase()}] ${action.title}: ${action.detail}`)
    })
  }

  listSection('Lacunas de dados', result.dataGaps)

  sections.push('', `Confiança da análise: ${result.confidence}.`)
  return sections.join('\n')
}
