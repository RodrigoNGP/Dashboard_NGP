import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAnalyticsSnapshot, summarizeSnapshotForDisplay } from '../lib/analytics-snapshot'
import { parseStructuredAnalysis, renderStructuredAnalysisMarkdown } from '../lib/analytics-contract'
import type { Ad, Campaign, DateParam } from '../types'

const period: DateParam = {
  time_range: JSON.stringify({ since: '2026-04-17', until: '2026-04-23' }),
}

const campaigns: Campaign[] = [
  {
    id: 'c1',
    name: 'Leads Meta',
    status: 'ACTIVE',
    objective: 'LEADS',
    spend: 420,
    impressions: 15000,
    clicks: 240,
    ctr: 1.6,
    cpc: 1.75,
    conversations: 18,
    leads: 11,
    purchases: 1,
    purchaseValue: 850,
    roas: 2.02,
    reach: 11000,
  },
  {
    id: 'c2',
    name: 'Topo de funil',
    status: 'ACTIVE',
    objective: 'TRAFFIC',
    spend: 180,
    impressions: 14000,
    clicks: 120,
    ctr: 0.86,
    cpc: 1.5,
    conversations: 0,
    leads: 0,
    purchases: 0,
    purchaseValue: 0,
    roas: 0,
    reach: 9000,
  },
]

const previousCampaigns: Campaign[] = [
  {
    id: 'p1',
    name: 'Periodo anterior',
    status: 'ACTIVE',
    objective: 'LEADS',
    spend: 500,
    impressions: 12000,
    clicks: 200,
    ctr: 1.66,
    cpc: 2.5,
    conversations: 10,
    leads: 6,
    purchases: 1,
    purchaseValue: 600,
    roas: 1.2,
    reach: 8000,
  },
]

const creatives: Ad[] = [
  {
    id: 'a1',
    name: 'Criativo 1',
    status: 'ACTIVE',
    spend: 220,
    impressions: 9000,
    clicks: 140,
    ctr: 1.55,
    cpc: 1.57,
    conversations: 12,
    leads: 7,
    purchases: 1,
    purchaseValue: 600,
    roas: 2.72,
    reach: 7000,
  },
  {
    id: 'a2',
    name: 'Criativo 2',
    status: 'ACTIVE',
    spend: 0,
    impressions: 0,
    clicks: 0,
    ctr: 0,
    cpc: 0,
    conversations: 0,
    leads: 0,
    purchases: 0,
    purchaseValue: 0,
    roas: 0,
    reach: 0,
  },
]

test('buildAnalyticsSnapshot gera snapshot canonico para IA e dashboard', () => {
  const snapshot = buildAnalyticsSnapshot({
    client: {
      id: 'client-1',
      name: 'Solucione Energia',
      username: 'solucione',
      metaAccountId: '123456',
    },
    period: {
      label: '17/04/2026 a 23/04/2026',
      current: period,
      comparisonLabel: '10/04/2026 a 16/04/2026',
      comparison: period,
    },
    campaigns,
    prevCampaigns: previousCampaigns,
    creatives,
    selectedCampaignIds: ['c1'],
    monthlyAuthorizedBudget: 3000,
    generatedAt: '2026-04-26T12:00:00.000Z',
  })

  assert.equal(snapshot.schemaVersion, 3)
  assert.equal(snapshot.client.name, 'Solucione Energia')
  assert.equal(snapshot.summary.spend, 600)
  assert.equal(snapshot.summary.primaryResultLabel, 'Conversas')
  assert.equal(snapshot.summary.filteredCampaignCount, 2)
  assert.equal(snapshot.filters.selectedCampaignIds.length, 1)
  assert.equal(snapshot.creatives.length, 1)
  assert.ok(snapshot.summary.periodAuthorizedBudget > 0)
  assert.ok(snapshot.summary.budgetUsagePercent > 0)
  assert.ok(snapshot.comparison?.deltas.cpc !== null)
  assert.equal(snapshot.diagnosis.signals.length, 5)

  const display = summarizeSnapshotForDisplay(snapshot)
  assert.ok(display.spendDelta !== null)
  assert.ok(display.ctrDelta !== null)
})

test('structured analysis contract parses and renders deterministic markdown', () => {
  const parsed = parseStructuredAnalysis({
    version: 1,
    headline: 'Conta com margem para escalar',
    diagnosis: 'CTR sustentado e CPC controlado no periodo analisado.',
    wins: ['Campanha principal sustentou o volume com eficiencia.'],
    risks: ['Dependencia elevada de uma unica campanha.'],
    opportunities: ['Redistribuir verba para criativos com melhor CTR.'],
    nextActions: [
      {
        title: 'Escalar campanha principal',
        detail: 'Aumentar verba gradualmente e monitorar frequencia.',
        priority: 'high',
      },
    ],
    dataGaps: ['Breakdown por placement ainda nao consolidado.'],
    confidence: 'medium',
  })

  assert.ok(parsed)
  const markdown = renderStructuredAnalysisMarkdown(parsed!)
  assert.match(markdown, /Conta com margem para escalar/)
  assert.match(markdown, /Proximas acoes|Próximas ações/i)
})
