import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeBuckets, startOfUtcDay, DAY } from '../src/providers/usage.mjs'
import openai from '../src/providers/openai.mjs'
import anthropic from '../src/providers/anthropic.mjs'
import gemini from '../src/providers/gemini.mjs'

test('summarizeBuckets 兼容 {value} 与字符串金额', () => {
  const today = startOfUtcDay(Date.now())
  const buckets = [
    { start_time: (today - DAY) / 1000, results: [{ amount: { value: 1.5 } }] },
    { start_time: today / 1000, results: [{ amount: { value: 0.5 } }] },
  ]
  const sum = summarizeBuckets(buckets, {
    tsOf: (b) => b.start_time * 1000,
    amountOf: (b) => b.results.reduce((acc, r) => acc + r.amount.value, 0),
    todayStart: today,
  })
  assert.equal(sum.periodSpend, 2)
  assert.equal(sum.todaySpend, 0.5)

  const strBuckets = [{ starting_at: new Date(today).toISOString(), results: [{ amount: '0.25' }] }]
  const s2 = summarizeBuckets(strBuckets, {
    tsOf: (b) => Date.parse(b.starting_at),
    amountOf: (b) => b.results.reduce((acc, r) => acc + Number(r.amount), 0),
    todayStart: today,
  })
  assert.equal(s2.todaySpend, 0.25)
})

test('OpenAI 缺少 Admin Key 时给出明确提示', async () => {
  await assert.rejects(openai.fetchSnapshot({ env: {}, config: {} }), /OPENAI_ADMIN_KEY/)
})

test('Anthropic 缺少 Admin Key 时给出明确提示', async () => {
  await assert.rejects(anthropic.fetchSnapshot({ env: {}, config: {} }), /ANTHROPIC_ADMIN_KEY/)
})

test('Gemini 用手动余额，未配置时报错', async () => {
  const snap = await gemini.fetchSnapshot({ config: { balance: 25, currency: 'usd', updatedAt: '2026-11-01' } })
  assert.equal(snap.total, 25)
  assert.equal(snap.currency, 'USD')
  assert.match(snap.note, /手动维护/)

  await assert.rejects(gemini.fetchSnapshot({ config: {} }), /providers\.gemini\.balance/)
})
