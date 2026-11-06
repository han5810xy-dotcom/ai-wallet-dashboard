import { fetchJson, toNumber, round } from '../util.mjs'
import { startOfUtcDay, DAY } from './usage.mjs'

/**
 * Anthropic 组织级费用报表。
 * 文档：https://platform.claude.com/docs/en/api/admin/cost_report/retrieve
 * 需要 **Admin Key**（sk-ant-admin…）+ `anthropic-version` 头。
 * GET /v1/organizations/cost_report?starting_at=…&ending_at=…&bucket_width=1d
 *   → { data: [{ starting_at, results: [{ amount: "0.12", currency: "USD" }] }] }
 * 金额是字符串小数，这里统一转成数字。
 */
export default {
  id: 'anthropic',
  name: 'Anthropic Claude',
  kind: 'usage',
  envKeys: ['ANTHROPIC_ADMIN_KEY'],
  dashboardUrl: 'https://platform.claude.com/settings/cost',
  docs: 'https://platform.claude.com/docs/en/api/admin/cost_report/retrieve',
  defaultLowBalance: null,

  async fetchSnapshot({ env, config = {} }) {
    const apiKey = env.ANTHROPIC_ADMIN_KEY
    if (!apiKey) throw new Error('未配置 ANTHROPIC_ADMIN_KEY（需要 Admin Key，普通 sk-ant- 无效）')

    const days = config.days || 30
    const start = startOfUtcDay(Date.now() - (days - 1) * DAY)
    const end = Date.now()
    const iso = (ts) => new Date(ts).toISOString().replace(/\.\d{3}Z$/, 'Z')
    const url =
      'https://api.anthropic.com/v1/organizations/cost_report' +
      `?starting_at=${encodeURIComponent(iso(start))}&ending_at=${encodeURIComponent(iso(end))}` +
      `&bucket_width=1d&limit=${days}`

    const data = await fetchJson(url, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    })

    let total = 0
    let today = 0
    let currency = 'USD'
    const todayStart = startOfUtcDay(Date.now())

    for (const bucket of data?.data || []) {
      const ts = Date.parse(bucket?.starting_at || '')
      const amount = (bucket?.results || []).reduce((acc, r) => acc + toNumber(r?.amount), 0)
      if (!Number.isFinite(ts) || !Number.isFinite(amount)) continue
      total += amount
      if (ts >= todayStart) today += amount
      if (bucket?.results?.[0]?.currency) currency = String(bucket.results[0].currency).toUpperCase()
    }

    return {
      currency,
      balance: round(total),
      total: round(total),
      reserved: 0,
      periodSpend: round(total),
      todaySpend: round(today),
      periodDays: days,
      note: `近 ${days} 天组织费用，非余额`,
    }
  },
}
