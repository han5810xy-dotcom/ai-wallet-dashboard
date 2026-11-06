import { fetchJson, toNumber, round } from '../util.mjs'

/**
 * Kimi（Moonshot AI 开放平台）。
 * 文档：https://platform.moonshot.cn/docs/api/balance
 * GET https://api.moonshot.cn/v1/users/me/balance
 *   → { status: true, data: { available_balance, voucher_balance, cash_balance } }
 * 金额单位：人民币元；voucher 是代金券余额。
 */
export default {
  id: 'kimi',
  name: 'Kimi（Moonshot）',
  kind: 'balance',
  envKeys: ['MOONSHOT_API_KEY'],
  dashboardUrl: 'https://platform.moonshot.cn/console/info',
  docs: 'https://platform.moonshot.cn/docs/api/balance',
  defaultLowBalance: 10,

  async fetchSnapshot({ env }) {
    const apiKey = env.MOONSHOT_API_KEY
    if (!apiKey) throw new Error('未配置 MOONSHOT_API_KEY')

    const data = await fetchJson('https://api.moonshot.cn/v1/users/me/balance', {
      headers: { authorization: `Bearer ${apiKey}` },
    })
    if (data?.status === false || data?.code) {
      throw new Error(`Kimi 返回异常：${data?.message || data?.code}`)
    }

    const info = data?.data || {}
    const cash = toNumber(info.cash_balance)
    const voucher = toNumber(info.voucher_balance)
    const available = toNumber(info.available_balance, cash + voucher)

    return {
      currency: 'CNY',
      balance: round(available),
      total: round(available),
      reserved: 0,
      granted: round(voucher),
      note: voucher > 0 ? `含代金券 ¥${round(voucher)}` : undefined,
    }
  },
}
