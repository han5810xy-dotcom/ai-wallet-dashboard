import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, appendFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { SnapshotStore } from '../src/store.mjs'
import { Collector } from '../src/collector.mjs'

async function tempStore(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ai-wallet-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return { store: new SnapshotStore(dir), dir }
}

test('追加与读取快照', async (t) => {
  const { store } = await tempStore(t)
  const now = Date.now()
  await store.append('deepseek', { total: 100, currency: 'CNY' }, now - 1000)
  await store.append('deepseek', { total: 96, currency: 'CNY' }, now)
  const rows = await store.read('deepseek', now)
  assert.equal(rows.length, 2)
  assert.equal(rows[1].total, 96)
  assert.equal(rows[1].currency, 'CNY')
})

test('损坏的行被跳过，不影响其它数据', async (t) => {
  const { store, dir } = await tempStore(t)
  const now = Date.now()
  await store.append('routerone', { total: 5 }, now)
  await appendFile(path.join(dir, 'routerone.jsonl'), '{"t":oops\n', 'utf8')
  await store.append('routerone', { total: 4.5 }, now + 1)
  const rows = await store.read('routerone', now + 2)
  assert.equal(rows.length, 2)
})

test('prune 丢掉 90 天前的点', async (t) => {
  const { store } = await tempStore(t)
  const now = Date.now()
  const old = now - 120 * 24 * 60 * 60 * 1000
  await store.append('deepseek', { total: 1 }, old)
  await store.append('deepseek', { total: 2 }, now)
  await store.prune('deepseek', now)
  const rows = await store.read('deepseek', now)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].total, 2)
})

test('未配置 Key 的平台标记为未连接并给出提示', async (t) => {
  const { store } = await tempStore(t)
  const collector = new Collector({ store, env: {}, config: {} })
  const data = await collector.collect(['deepseek'])
  const item = data.providers[0]
  assert.equal(item.ok, false)
  assert.equal(item.configured, false)
  assert.match(item.error, /DEEPSEEK_API_KEY/)
})

test('采集成功后写入快照并返回消耗统计', async (t) => {
  const { store } = await tempStore(t)
  const now = Date.now()
  await store.append('deepseek', { total: 100, currency: 'CNY' }, now - 60_000)
  const provider = {
    id: 'fake',
    name: 'Fake 平台',
    envKeys: ['FAKE_KEY'],
    defaultLowBalance: 5,
    async fetchSnapshot() {
      return { currency: 'CNY', balance: 90, total: 90 }
    },
  }
  const collector = new Collector({ store, env: { FAKE_KEY: 'x' }, config: {} })
  // 直接替换注册表里的平台，模拟新增适配器
  const item = await collector.collectOne({ ...provider, id: 'deepseek' })
  assert.equal(item.ok, true)
  assert.equal(item.total, 90)
  // 已有 1 个旧点（100）+ 本次采集（90），窗口内 2 个点，净消耗 10
  assert.equal(item.spend.h24.samples, 2)
  assert.equal(item.spend.h24.spent, 10)
})
