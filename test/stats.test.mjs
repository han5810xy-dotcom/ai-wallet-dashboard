import test from 'node:test'
import assert from 'node:assert/strict'
import { spendStats, downsample, WINDOWS } from '../src/stats.mjs'

const HOUR = 60 * 60 * 1000

test('窗口内样本不足时返回 null，而不是 0', () => {
  const now = Date.now()
  const history = [{ t: now - 1000, total: 100 }]
  const stats = spendStats(history, now)
  assert.equal(stats.h24, null)
  assert.equal(stats.d7, null)
})

test('余额下降得到净消耗', () => {
  const now = Date.now()
  const history = [
    { t: now - 2 * HOUR, total: 100 },
    { t: now - 1 * HOUR, total: 92 },
    { t: now, total: 88 },
  ]
  const { h24 } = spendStats(history, now)
  assert.equal(h24.spent, 12)
  assert.equal(h24.toppedUp, 0)
  assert.equal(h24.samples, 3)
})

test('充值导致的净上升不记为消耗', () => {
  const now = Date.now()
  const history = [
    { t: now - 2 * HOUR, total: 10 },
    { t: now - 1 * HOUR, total: 60 },
    { t: now, total: 58 },
  ]
  const { h24 } = spendStats(history, now)
  assert.equal(h24.spent, 0)
  // 净变化 = 10 - 58 = -48，即这段时间净充值 48（含充值后的 2 元消耗）
  assert.equal(h24.toppedUp, 48)
})

test('窗口外的旧点不参与计算', () => {
  const now = Date.now()
  const history = [
    { t: now - 10 * 24 * HOUR, total: 1000 },
    { t: now - 2 * HOUR, total: 50 },
    { t: now, total: 48 },
  ]
  const stats = spendStats(history, now)
  assert.equal(stats.h24.spent, 2)
  assert.equal(stats.d7.spent, 2)
  assert.ok(stats.d30.samples >= 2)
})

test('downsample 保持首尾并压到上限内', () => {
  const rows = Array.from({ length: 500 }, (_, i) => ({ t: i, total: 100 - i }))
  const out = downsample(rows, 120)
  assert.equal(out.length, 120)
  assert.equal(out[0].t, 0)
  assert.equal(out[out.length - 1].t, 499)
})

test('WINDOWS 定义与 UI 一致', () => {
  assert.deepEqual(Object.keys(WINDOWS), ['h24', 'd7', 'd30'])
})
