import { getProviders } from './providers/index.mjs'
import { spendStats, downsample } from './stats.mjs'
import { dailySeries, forecast } from './daily.mjs'
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

  /** 统一补齐「按天聚合 + 预测」，让各分支返回结构一致 */
  withDerived(base, history, now) {
    const daily = dailySeries(history, { days: 14, now })
    return {
      ...base,
      history: downsample(history),
      daily,
      spend: spendStats(history, now),
      forecast: forecast(base.total, daily),
    }
  }

  async collectOne(provider) {
    const cfg = this.providerConfig(provider.id)
    const base = {
      id: provider.id,
      name: cfg.name || provider.name,
      kind: provider.kind || 'balance',
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

    // envKeys 为空表示该平台不靠环境变量（例如千问走 CLI 登录态）
    const needsEnv = provider.envKeys.length > 0
    const envKey = needsEnv ? provider.envKeys.find((k) => this.env[k]) : 'cli'
    if (!envKey) {
      base.error = `未配置 ${provider.envKeys.join(' / ')}`
      const history = await this.store.read(provider.id, this.now())
      return this.withDerived(base, history, this.now())
    }

    base.configured = true
    try {
      const snap = await provider.fetchSnapshot({ env: this.env, config: cfg })
      const ts = this.now()
      // 账单型平台没有「余额」可采样，直接返回当期费用，不写快照
      if ((provider.kind || 'balance') === 'usage') {
        return {
          ...base,
          ...snap,
          ok: true,
          updatedAt: ts,
          history: [],
          daily: [],
          spend: spendStats([], ts),
          forecast: null,
        }
      }
      await this.store.append(provider.id, snap, ts)
      const history = await this.store.read(provider.id, ts)
      return this.withDerived({ ...base, ...snap, ok: true, updatedAt: ts }, history, ts)
    } catch (err) {
      const history = await this.store.read(provider.id, this.now())
      return this.withDerived(
        { ...base, error: err?.message || String(err), status: err?.status ?? null },
        history,
        this.now(),
      )
    }
  }

  /** 演示数据：7 天每小时一个点，中间一次充值，便于直观看到消耗曲线 */
  mockItem(provider, base) {
    const end = this.now()

    if ((provider.kind || 'balance') === 'usage') {
      const period = provider.id === 'openai' ? 42.18 : 27.64
      const today = provider.id === 'openai' ? 1.92 : 0.86
      return {
        ...base,
        configured: true,
        ok: true,
        currency: 'USD',
        balance: period,
        total: period,
        periodSpend: period,
        todaySpend: today,
        periodDays: 30,
        note: '近 30 天组织费用，非余额',
        updatedAt: end,
        history: [],
        daily: [],
        spend: spendStats([], end),
        forecast: null,
      }
    }

    const points = []
    const seed = provider.id.length * 7919
    const isCny = provider.id === 'deepseek' || provider.id === 'qianwen' || provider.id === 'kimi'
    const hash = [...provider.id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
    let value = isCny ? 60 + (hash % 90) : 4 + (hash % 18)
    for (let i = 168; i >= 0; i -= 1) {
      const t = end - i * HOUR
      const noise = (Math.sin((i + seed) * 1.7) + Math.cos(i * 0.37)) * 0.012
      value -= (isCny ? 0.42 : 0.031) * (1 + noise)
      if (i === 96) value += isCny ? 50 : 5 // 三天前充值
      points.push({ t, total: round(Math.max(value, 0.01)), balance: round(Math.max(value, 0.01)) })
    }
    const last = points[points.length - 1]
    return this.withDerived(
      {
        ...base,
        configured: true,
        ok: true,
        currency: isCny ? 'CNY' : 'USD',
        balance: last.total,
        total: last.total,
        updatedAt: end,
      },
      points,
      end,
    )
  }
}
