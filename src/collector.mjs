import { getProviders } from './providers/index.mjs'
import { spendStats, downsample } from './stats.mjs'
import { round } from './util.mjs'

const HOUR = 60 * 60 * 1000

/**
 * 采集器：调用适配器 → 写快照 → 汇总历史与消耗，产出给 UI 的 JSON。
 * 单个平台失败不影响其它平台，错误只落在该卡片的 error 字段上。
 */
export class Collector {
  constructor({ store, env = process.env, config = {}, mock = false, now = () => Date.now() }) {
    this.store = store
    this.env = env
    this.config = config
    this.mock = mock
    this.now = now
  }

  providerConfig(id) {
    return this.config?.providers?.[id] ?? {}
  }

  async collect(ids) {
    const providers = getProviders(ids)
    const items = await Promise.all(providers.map((p) => this.collectOne(p)))
    return {
      generatedAt: this.now(),
      mock: this.mock,
      refreshSeconds: this.config?.refreshSeconds ?? 60,
      providers: items,
    }
  }

  async collectOne(provider) {
    const cfg = this.providerConfig(provider.id)
    const base = {
      id: provider.id,
      name: cfg.name || provider.name,
      currency: cfg.currency || 'CNY',
      dashboardUrl: provider.dashboardUrl,
      docs: provider.docs,
      configured: false,
      ok: false,
      error: null,
      balance: null,
      total: null,
      reserved: 0,
      granted: 0,
      note: null,
      lowBalance: cfg.lowBalance ?? provider.defaultLowBalance ?? null,
      updatedAt: null,
    }

    if (this.mock) return this.mockItem(provider, base)

    const envKey = provider.envKeys.find((k) => this.env[k])
    if (!envKey) {
      base.error = `未配置 ${provider.envKeys.join(' / ')}`
      const history = await this.store.read(provider.id, this.now())
      return { ...base, history: downsample(history), spend: spendStats(history, this.now()) }
    }

    base.configured = true
    try {
      const snap = await provider.fetchSnapshot({ env: this.env, config: cfg })
      const ts = this.now()
      await this.store.append(provider.id, snap, ts)
      const history = await this.store.read(provider.id, ts)
      return {
        ...base,
        ...snap,
        ok: true,
        updatedAt: ts,
        history: downsample(history),
        spend: spendStats(history, ts),
      }
    } catch (err) {
      const history = await this.store.read(provider.id, this.now())
      return {
        ...base,
        error: err?.message || String(err),
        status: err?.status ?? null,
        history: downsample(history),
        spend: spendStats(history, this.now()),
      }
    }
  }

  /** 演示数据：7 天每小时一个点，中间一次充值，便于直观看到消耗曲线 */
  mockItem(provider, base) {
    const end = this.now()
    const points = []
    const seed = provider.id.length * 7919
    let value = provider.id === 'deepseek' ? 168.4 : 12.8
    for (let i = 168; i >= 0; i -= 1) {
      const t = end - i * HOUR
      const noise = (Math.sin((i + seed) * 1.7) + Math.cos(i * 0.37)) * 0.012
      value -= (provider.id === 'deepseek' ? 0.42 : 0.031) * (1 + noise)
      if (i === 96) value += provider.id === 'deepseek' ? 50 : 5 // 三天前充值
      points.push({ t, total: round(Math.max(value, 0.01)), balance: round(Math.max(value, 0.01)) })
    }
    const last = points[points.length - 1]
    return {
      ...base,
      configured: true,
      ok: true,
      currency: provider.id === 'deepseek' ? 'CNY' : 'USD',
      balance: last.total,
      total: last.total,
      updatedAt: end,
      history: downsample(points),
      spend: spendStats(points, end),
    }
  }
}
