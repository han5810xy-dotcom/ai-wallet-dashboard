import { fetchJson, toNumber, round } from '../util.mjs'

/**
 * DeepSeek 开放平台。
 * 文档：https://api-docs.deepseek.com/zh-cn/api/get-user-balance
 * 注意：这里的 Key 是 platform.deepseek.com 里创建的 API Key（sk-…），
 * 不是网页登录态；余额单位由响应里的 currency 决定（国内账号通常是 CNY）。
 */
export default {
  id: 'deepseek',
  name: 'DeepSeek 开放平台',
  envKeys: ['DEEPSEEK_API_KEY'],
  dashboardUrl: 'https://platform.deepseek.com/usage',
  docs: 'https://api-docs.deepseek.com/zh-cn/api/get-user-balance',
  defaultLowBalance: 10,

  async fetchSnapshot({ env }) {
    const apiKey = env.DEEPSEEK_API_KEY
    if (!apiKey) throw new Error('未配置 DEEPSEEK_API_KEY')

    const data = await fetchJson('https://api.deepseek.com/user/balance', {
      headers: { authorization: `Bearer ${apiKey}` },
    })

    const info = Array.isArray(data.balance_infos) ? data.balance_infos[0] : null
    if (!info) throw new Error('响应里没有 balance_infos，接口可能已变更')

    const toppedUp = toNumber(info.topped_up_balance)
    const granted = toNumber(info.granted_balance)
    const total = toNumber(info.total_balance, toppedUp + granted)

    return {
      currency: info.currency || 'CNY',
      // 可消费金额：充值余额 + 赠送余额；平台优先扣赠送部分
      balance: round(total),
      total: round(total),
      reserved: 0,
      granted: round(granted),
      available: data.is_available !== false,
      note: granted > 0 ? `含赠送 ${info.currency === 'USD' ? '$' : '¥'}${round(granted)}（优先扣减）` : undefined,
    }
  },
}
