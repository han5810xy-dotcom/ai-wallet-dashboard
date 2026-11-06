import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import qianwen, { parseBalance } from '../src/providers/qianwen.mjs'

test('解析 {data:{available}} 结构', () => {
  const out = parseBalance({ data: { available: '12.34', currency: 'CNY' } })
  assert.equal(out.balance, 12.34)
  assert.equal(out.currency, 'CNY')
  assert.equal(out.total, 12.34)
})

test('解析顶层 balance 与 cashe 字段', () => {
  assert.equal(parseBalance({ balance: 8 }).balance, 8)
  assert.equal(parseBalance({ cashBalance: '0.5' }).balance, 0.5)
  assert.equal(parseBalance({ data: { balance: { available: 3.2 } } }).balance, 3.2)
})

test('未知结构报错并带原文片段', () => {
  assert.throws(() => parseBalance({ foo: 'bar' }), /无法识别/)
})

test('通过子进程读取 CLI 输出（用 node 脚本模拟 qianwen）', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'qianwen-fixture-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const script = path.join(dir, 'fake-qianwen.mjs')
  await writeFile(script, `console.log(JSON.stringify({ data: { available: "42.50", currency: "CNY" } }))`, 'utf8')

  const snap = await qianwen.fetchSnapshot({
    env: {},
    config: { command: process.execPath, args: [script] },
  })
  assert.equal(snap.balance, 42.5)
  assert.equal(snap.currency, 'CNY')
})

test('命令不存在时给出安装提示', async (t) => {
  await assert.rejects(
    qianwen.fetchSnapshot({ env: {}, config: { command: 'definitely-not-a-qianwen-cli' } }),
    /未找到 qianwen 命令/,
  )
})
