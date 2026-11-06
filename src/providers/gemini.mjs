import { toNumber, round } from '../util.mjs'

/**
 * Google Gemini / AI Studio。
 *
 * 现实：Gemini 没有公开的「余额」或「组织费用」API（要查花费得走
 * Google Cloud Billing + BigQuery 导出，需要 GCP 服务账号，太重）。
 * 因此这里做成**手动余额**：在 ai-wallet.config.json 里登记你充进去的额度，
 * 看板照常显示、告警、画趋势，只是数据靠你自己更新。
 *
 * 配置示例：
 *   "gemini": { "balance": 25, "currency": "USD", "updatedAt": "2026-11-01" }
 */
export default {
  id: 'gemini',
  name: 'Google Gemini',
  kind: 'balance',
  envKeys: [],
  requires: '在 ai-wallet.config.json 手动填写 providers.gemini.balance',
  dashboardUrl: 'https://aistudio.google.com/',
  defaultLowBalance: 5,

  async fetchSnapshot({ config = {} }) {
    if (config.balance === undefined || config.balance === null) {
      throw new Error('Gemini 没有公开的余额接口，请在 ai-wallet.config.json 里填写 providers.gemini.balance')
    }
    const balance = round(toNumber(config.balance))
    return {
      currency: String(config.currency || 'USD').toUpperCase(),
      balance,
      total: balance,
      reserved: 0,
      note: config.updatedAt ? `手动维护 · ${config.updatedAt} 更新` : '手动维护',
    }
  },
}
