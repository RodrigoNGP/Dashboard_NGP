import test from 'node:test'
import assert from 'node:assert/strict'
import { parseIns } from '../lib/utils'

test('parseIns normaliza insights da Meta e calcula ROAS fallback', () => {
  const parsed = parseIns({
    spend: '250.50',
    impressions: '10000',
    clicks: '200',
    ctr: '2',
    cpc: '1.2525',
    reach: '8000',
    actions: [
      { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '12' },
      { action_type: 'lead', value: '5' },
      { action_type: 'purchase', value: '2' },
    ],
    action_values: [{ action_type: 'purchase', value: '1000' }],
    purchase_roas: [],
  })

  assert.deepEqual(parsed, {
    spend: 250.5,
    impressions: 10000,
    clicks: 200,
    ctr: 2,
    cpc: 1.2525,
    reach: 8000,
    conversations: 12,
    leads: 5,
    purchases: 2,
    purchaseValue: 1000,
    roas: 3.99,
  })
})

test('parseIns respeita purchase_roas quando a Meta ja devolve o valor', () => {
  const parsed = parseIns({
    spend: '100',
    actions: [{ action_type: 'purchase', value: '1' }],
    action_values: [{ action_type: 'purchase', value: '450' }],
    purchase_roas: [{ value: '4.5' }],
  })

  assert.equal(parsed?.roas, 4.5)
  assert.equal(parsed?.purchaseValue, 450)
  assert.equal(parsed?.purchases, 1)
})
