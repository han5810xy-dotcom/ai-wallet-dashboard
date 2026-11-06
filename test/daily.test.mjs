import test from 'node:test'
import assert from 'node:assert/strict'
import { dailySeries, forecast } from '../src/daily.mjs'

const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000

function at(daysAgo, hour = 12) {
  const d = new Date(Date.now() - daysAgo * DAY)
  d.setHours(hour, 0, 0, 0)
  return d.getTime()
}

test('按天拆分消耗与充值', () => {
  const history = [
    { t: at(2, 9), total: 100 },
    { t: at(2, 18), total: 90 }, // 当天消耗 10
    { t: at(1, 9), total: 90 },
    { t: at(1, 18), total: 40 }, // 当天消耗 50，但中途充值
    { t: at(0, 9), total: 60 }, // 充值 +20
    { t: at(0, 18), total: 55 }, // 消耗 5
  ]
  const daily = dailySeries(history, { days: 3, now: Date.now() })
  assert.equal(daily.length, 3)
  assert.equal(daily[0].spend, 10)
  assert.equal(daily[1].spend, 50)
  assert.equal(daily[2].spend, 5)
  assert.equal(daily[2].toppedUp, 20)
  assert.equal(daily[2].balance, 55)
})

test('没有采样的日子填 0 消耗并沿用余额', () => {
  const history = [
    { t: at(3, 9), total: 50 },
    { t: at(3, 18), total: 45 },
  ]
  const daily = dailySeries(history, { days: 4, now: Date.now() })
  assert.equal(daily.filter((d) => d.spend === 0).length, 3)
  assert.equal(daily[3].balance, 45)
})

test('预测：日均、可用天数、月耗', () => {
  const daily = Array.from({ length: 7 }, () => ({ spend: 2 }))
  const f = forecast(28, daily)
  assert.equal(f.avgDaily, 2)
  assert.equal(f.daysLeft, 14)
  assert.equal(f.monthly, 60)
})

test('没有消耗样本时预测为 null', () => {
  assert.equal(forecast(100, [{ spend: 0 }, { spend: 0 }]), null)
  assert.equal(forecast(0, [{ spend: 0 }]), null)
})
