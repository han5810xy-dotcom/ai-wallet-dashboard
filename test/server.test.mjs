import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { SnapshotStore } from '../src/store.mjs'
import { Collector } from '../src/collector.mjs'
import { startServer } from '../src/server.mjs'

async function boot(t, { mock = true } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ai-wallet-srv-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const store = new SnapshotStore(dir)
  const collector = new Collector({ store, env: {}, config: {}, mock })
  const { server, url } = await startServer({ collector, refreshSeconds: 0, port: 0 })
  t.after(() => new Promise((r) => server.close(r)))
  return { url, store }
}

test('GET /api/summary 返回三个平台与派生字段', async (t) => {
  const { url } = await boot(t)
  const res = await fetch(`${url}/api/summary`)
  assert.equal(res.status, 200)
  const data = await res.json()
  assert.equal(data.providers.length, 3)
  for (const p of data.providers) {
    assert.ok('daily' in p, '每个平台都带按天聚合')
    assert.ok('forecast' in p)
    assert.ok(Array.isArray(p.history))
  }
})

test('GET /api/export.csv 输出 CSV 并带上附件头', async (t) => {
  const { url, store } = await boot(t)
  const now = Date.now()
  await store.append('deepseek', { currency: 'CNY', balance: 12.5, total: 12.5 }, now - 1000)
  await store.append('deepseek', { currency: 'CNY', balance: 11.5, total: 11.5 }, now)

  const res = await fetch(`${url}/api/export.csv?provider=deepseek`)
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type') || '', /text\/csv/)
  assert.match(res.headers.get('content-disposition') || '', /deepseek-snapshots\.csv/)
  const text = await res.text()
  assert.equal(text.trim().split('\n').length, 3, '表头 + 2 行')
})

test('非法 provider 参数返回 400', async (t) => {
  const { url } = await boot(t)
  const res = await fetch(`${url}/api/export.csv?provider=../etc/passwd`)
  assert.equal(res.status, 400)
})

test('静态资源可访问，未知路径 404，路径穿越被拒绝', async (t) => {
  const { url } = await boot(t)
  assert.equal((await fetch(`${url}/`)).status, 200)
  assert.equal((await fetch(`${url}/app.js`)).status, 200)
  assert.equal((await fetch(`${url}/nope.txt`)).status, 404)
  assert.equal((await fetch(`${url}/..%2f..%2fpackage.json`)).status, 403)
})
