import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMetaAnalysis } from '../lib/meta-analysis'
import type { Campaign } from '../types'

const currentCampaigns: Campaign[] = [
  {
    id: 'c1',
    name: 'Campanha Escala',
    status: 'ACTIVE',
    objective: 'LEADS',
    spend: 300,
    impressions: 10000,
    clicks: 200,
    ctr: 2,
    cpc: 1.5,
    conversations: 30,
    leads: 25,
    purchases: 2,
    purchaseValue: 900,
    roas: 3,
    reach: 7000,
  },
  {
    id: 'c2',
    name: 'Campanha Gargalo',
    status: 'PAUSED',
    objective: 'LEADS',
    spend: 100,
    impressions: 8000,
    clicks: 5,
    ctr: 0.06,
    cpc: 20,
    conversations: 0,
    leads: 0,
    purchases: 0,
    purchaseValue: 0,
    roas: 0,
    reach: 5000,
  },
]

const previousCampaigns: Campaign[] = [
  {
    id: 'p1',
    name: 'Periodo anterior',
    status: 'ACTIVE',
    objective: 'LEADS',
    spend: 250,
    impressions: 9000,
    clicks: 150,
    ctr: 1.66,
    cpc: 1.66,
    conversations: 8,
    leads: 18,
    purchases: 1,
    purchaseValue: 500,
    roas: 2,
    reach: 6500,
  },
]

test('buildMetaAnalysis consolida totais, deltas e sinais principais', () => {
  const analysis = buildMetaAnalysis(currentCampaigns, previousCampaigns)

  assert.equal(analysis.current.spend, 400)
  assert.equal(analysis.current.primaryResults, 30)
  assert.equal(analysis.current.primaryResultLabel, 'Conversas')
  assert.equal(analysis.current.activeCampaigns, 1)
  assert.equal(analysis.current.pausedCampaigns, 1)
  assert.equal(analysis.previous?.spend, 250)
  assert.ok(analysis.deltas.spend !== null)
  assert.ok((analysis.deltas.spend || 0) > 0)
  assert.equal(analysis.topCampaigns[0]?.name, 'Campanha Escala')
  assert.equal(analysis.opportunity?.name, 'Campanha Escala')
  assert.equal(analysis.attention?.name, 'Campanha Gargalo')
  assert.ok(analysis.concentration.top1Share > 70)
  assert.match(analysis.headline, /clique|mensagem|renovacao|renovação|concentrad|domina|escalar/i)
})
