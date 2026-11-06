import { fetchJson, toNumber, round } from '../util.mjs'

/**
 * Router One（OpenAI 兼容网关）。
 * 文档：https://router.one/zh/docs/account/getBalance
 * GET /v1/balance → { currency: "USD", balance, reserved_balance, total_balance }
 *   balance          = 当前可直接消费的金额（已含赠送额度）
 *   reserved_balance = 进行中请求的预扣
 *   total_balance    = balance + reserved_balance，做趋势对比时用它更稳
 * 独立限流：每 Key 每分钟 60 次。
 */
export default {
  id: 'routerone',
  name: 'Router One',
  envKeys: ['ROUTER_ONE_API_KEY'],
  dashboardUrl: 'https://router.one/dashboard',
  docs: 'https://router.one/zh/docs/account/getBalance',
  defaultLowBalance: 2,

  async fetchSnapshot({ env }) {
    const apiKey = env.ROUTER_ONE_API_KEY
    if (!apiKey) throw new Error('未配置 ROUTER_ONE_API_KEY')

    const data = await fetchJson('https://api.router.one/v1/balance', {
      headers: { authorization: `Bearer ${apiKey}` },
    })

    const balance = toNumber(data.balance)
    const reserved = toNumber(data.reserved_balance)
    const total = toNumber(data.total_balance, balance + reserved)

    return {
      currency: (data.currency || 'USD').toUpperCase(),
      balance: round(balance),
      total: round(total),
      reserved: round(reserved),
      available: true,
    }
  },
}
