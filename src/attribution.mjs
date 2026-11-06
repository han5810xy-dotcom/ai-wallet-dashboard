import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * 花费归因：读 DSH 的会话投影缓存，按会话汇总 token 与估算费用。
 *
 * 数据源：~/.dsh/storages/session_projcache/sessions/*.json
 *   identity.cwd                 会话的工作目录（即项目）
 *   rows.title.val               会话标题
 *   rows.tokenUsage.val.totals   { uncachedInputTokens, outputTokens, cacheReadTokens }
 *   rows.modelSelection.val.lastUsed.model
 *   sessionListMetadata.val.lastPromptAt
 *
 * 为什么不做逐日拆分：投影缓存只保留「当前累计值」，没有时间序列。
 * 精确到天需要解压 session.v4.jsonl.zstd，留到后续版本。
 */

export const DEFAULT_PRICING = {
  // CNY / 百万 tokens，按官方高峰价，便于给一个保守上限
  'deepseek-flash': { input: 2, cacheRead: 0.04, output: 8 },
  'deepseek-v4-pro': { input: 9, cacheRead: 0.3, output: 27 },
}
export const FALLBACK_MODEL = 'deepseek-flash'

export function priceTokens(tokens, pricing = DEFAULT_PRICING, model = FALLBACK_MODEL) {
  const rate = pricing[model]
  // 没登记单价的模型不硬套 DeepSeek 价，宁可只报 token，也不报错的金额
  if (!rate) return null
  const uncached = Number(tokens?.uncachedInputTokens) || 0
  const cacheRead = Number(tokens?.cacheReadTokens) || 0
  const output = Number(tokens?.outputTokens) || 0
  const cost = (uncached / 1e6) * rate.input + (cacheRead / 1e6) * rate.cacheRead + (output / 1e6) * rate.output
  return Math.round(cost * 10000) / 10000
}

export function parseSessionFile(raw, { id, pricing = DEFAULT_PRICING } = {}) {
  let json
  try {
    json = JSON.parse(raw)
  } catch {
    return null
  }
  const record = json?.record || {}
  const totals = record?.rows?.tokenUsage?.val?.totals
  if (!totals) return null

  const tokens =
    (Number(totals.uncachedInputTokens) || 0) +
    (Number(totals.cacheReadTokens) || 0) +
    (Number(totals.outputTokens) || 0)
  if (tokens <= 0) return null

  const model = record?.rows?.modelSelection?.val?.lastUsed?.model || FALLBACK_MODEL
  const cwd = record?.identity?.cwd || ''
  return {
    id,
    title: record?.rows?.title?.val || '（未命名会话）',
    cwd,
    project: cwd ? path.basename(cwd) : '未知项目',
    model,
    tokens,
    uncachedInputTokens: Number(totals.uncachedInputTokens) || 0,
    cacheReadTokens: Number(totals.cacheReadTokens) || 0,
    outputTokens: Number(totals.outputTokens) || 0,
    cost: priceTokens(totals, pricing, model),
    lastAt: record?.rows?.sessionListMetadata?.val?.lastPromptAt || record?.identity?.createdAt || 0,
  }
}

/** 纯函数：给定会话数组，汇总成看板需要的结构 */
export function summarize(sessions, { now = Date.now(), days = 30 } = {}) {
  const since = now - days * 24 * 60 * 60 * 1000
  const inRange = sessions.filter((s) => s.lastAt >= since)
  const totals = inRange.reduce(
    (acc, s) => {
      acc.tokens += s.tokens
      if (s.cost == null) acc.unknownCostSessions += 1
      else acc.cost += s.cost
      return acc
    },
    { tokens: 0, cost: 0, unknownCostSessions: 0 },
  )
  const byProject = new Map()
  for (const s of inRange) {
    const p = byProject.get(s.project) || { project: s.project, tokens: 0, cost: 0, sessions: 0 }
    p.tokens += s.tokens
    p.cost += s.cost || 0
    p.sessions += 1
    byProject.set(s.project, p)
  }

  return {
    available: true,
    days,
    sessions: inRange.length,
    tokens: totals.tokens,
    cost: Math.round(totals.cost * 100) / 100,
    unknownCostSessions: totals.unknownCostSessions,
    currency: 'CNY',
    top: inRange
      .slice()
      .sort((a, b) => (b.cost || 0) - (a.cost || 0) || b.tokens - a.tokens)
      .slice(0, 8),
    projects: [...byProject.values()].sort((a, b) => b.cost - a.cost).slice(0, 6),
  }
}

export async function collectAttribution({ dshDir, days = 30, now = Date.now(), pricing = DEFAULT_PRICING, limit = 400 }) {
  const dir = path.join(dshDir, 'storages', 'session_projcache', 'sessions')
  let files
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.json'))
  } catch (err) {
    return {
      available: false,
      reason: `读不到 DSH 会话缓存（${dir}）${err.code === 'ENOENT' ? '：目录不存在' : ''}`,
      days,
    }
  }

  const sessions = []
  for (const file of files.slice(0, limit)) {
    try {
      const raw = await readFile(path.join(dir, file), 'utf8')
      const parsed = parseSessionFile(raw, { id: file.replace(/^session-|\.json$/g, ''), pricing })
      if (parsed) sessions.push(parsed)
    } catch {
      // 单个文件坏了就跳过，归因不该因为一条脏数据整体失败
    }
  }
  return summarize(sessions, { now, days })
}
