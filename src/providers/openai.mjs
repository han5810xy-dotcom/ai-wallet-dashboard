import { fetchJson, toNumber, round } from '../util.mjs'
import { summarizeBuckets, startOfUtcDay, DAY } from './usage.mjs'

/**
 * OpenAI 组织级费用。
 * 文档：https://platform.openai.com/docs/api-reference/usage/costs
 * 需要 **Admin Key**（sk-admin-…），普通项目 Key 调不通。
 * GET /v1/organization/costs?start_time=<unix>&bucket_width=1d&limit=N
 *   → { data: [{ start_time, end_time, results: [{ amount: { value, currency } }] }] }
 */
export default {
  id: 'openai',
  name: 'OpenAI',
  kind: 'usage',
  envKeys: ['OPENAI_ADMIN_KEY'],
  dashboardUrl: 'https://platform.openai.com/usage',
  docs: 'https://platform.openai.com/docs/api-reference/usage/costs',
  defaultLowBalance: null,

  async fetchSnapshot({ env, config = {} }) {
    const apiKey = env.OPENAI_ADMIN_KEY
    if (!apiKey) throw new Error('未配置 OPENAI_ADMIN_KEY（需要 Admin Key，普通 sk- 无效）')

    const days = config.days || 30
    const start = startOfUtcDay(Date.now() - (days - 1) * DAY)
    const url = `https://api.openai.com/v1/organization/costs?start_time=${Math.floor(start / 1000)}&bucket_width=1d&limit=${days}`

    const data = await fetchJson(url, { headers: { authorization: `Bearer ${apiKey}` } })
    const sum = summarizeBuckets(data?.data, {
      tsOf: (b) => b?.start_time * 1000,
      amountOf: (b) => (b?.results || []).reduce((acc, r) => acc + toNumber(r?.amount?.value ?? r?.amount), 0),
      todayStart: startOfUtcDay(Date.now()),
    })
    const currency = String(data?.data?.[0]?.results?.[0]?.amount?.currency || 'usd').toUpperCase()

    return {
      currency,
      balance: round(sum.periodSpend),
      total: round(sum.periodSpend),
      reserved: 0,
      periodSpend: round(sum.periodSpend),
      todaySpend: round(sum.todaySpend),
      periodDays: days,
      note: `近 ${days} 天组织费用，非余额`,
    }
  },
}
