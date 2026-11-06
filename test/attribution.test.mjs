import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parseSessionFile, priceTokens, summarize, collectAttribution, DEFAULT_PRICING } from '../src/attribution.mjs'

function sessionJson({ title, cwd, model = 'deepseek-flash', totals, at }) {
  return JSON.stringify({
    version: 7,
    record: {
      identity: { createdAt: at, cwd },
      rows: {
        title: { val: title },
        tokenUsage: { val: { totals } },
        modelSelection: { val: { lastUsed: { model } } },
        sessionListMetadata: { val: { lastPromptAt: at } },
      },
    },
  })
}

test('解析会话：token 汇总与模型', () => {
  const raw = sessionJson({
    title: '重构认证模块',
    cwd: 'C:/work/shop',
    totals: { uncachedInputTokens: 1000, cacheReadTokens: 5000, outputTokens: 2000 },
    at: Date.now(),
  })
  const s = parseSessionFile(raw, { id: 'abc' })
  assert.equal(s.title, '重构认证模块')
  assert.equal(s.project, 'shop')
  assert.equal(s.tokens, 8000)
  assert.ok(s.cost > 0)
})

test('坏 JSON / 无用量时返回 null', () => {
  assert.equal(parseSessionFile('{oops', { id: 'x' }), null)
  assert.equal(parseSessionFile(JSON.stringify({ record: { rows: {} } }), { id: 'x' }), null)
})

test('价格计算：输入、缓存、输出分别计价', () => {
  const cost = priceTokens({ uncachedInputTokens: 1_000_000, cacheReadTokens: 1_000_000, outputTokens: 1_000_000 }, DEFAULT_PRICING, 'deepseek-flash')
  assert.equal(cost, 2 + 0.04 + 8)
})

test('未登记单价的模型只报 token，不套用别人的价格', () => {
  assert.equal(priceTokens({ uncachedInputTokens: 1_000_000 }, DEFAULT_PRICING, 'gpt-4o'), null)
})

test('按时间窗口过滤并排序', () => {
  const now = Date.now()
  const sessions = [
    { project: 'a', tokens: 100, cost: 1, lastAt: now - 1000 },
    { project: 'b', tokens: 200, cost: 5, lastAt: now - 2000 },
    { project: 'c', tokens: 50, cost: 9, lastAt: now - 40 * 24 * 3600 * 1000 },
  ]
  const out = summarize(sessions, { now, days: 30 })
  assert.equal(out.sessions, 2, '30 天外的会话被排除')
  assert.equal(out.cost, 6)
  assert.equal(out.top[0].project, 'b')
})

test('从目录读取会话（端到端）', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-attr-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const dir = path.join(root, 'storages', 'session_projcache', 'sessions')
  await mkdir(dir, { recursive: true })
  await writeFile(
    path.join(dir, 'session-1.json'),
    sessionJson({ title: 'A', cwd: '/w/proj-a', totals: { uncachedInputTokens: 10_000, outputTokens: 5_000 }, at: Date.now() }),
  )
  await writeFile(path.join(dir, 'session-2.json'), '{broken')
  const out = await collectAttribution({ dshDir: root, days: 30 })
  assert.equal(out.available, true)
  assert.equal(out.sessions, 1, '坏文件被跳过')
  assert.equal(out.projects[0].project, 'proj-a')
})

test('目录不存在时给出可读原因', async () => {
  const out = await collectAttribution({ dshDir: path.join(os.tmpdir(), 'definitely-missing-dsh') })
  assert.equal(out.available, false)
  assert.match(out.reason, /DSH 会话缓存/)
})
