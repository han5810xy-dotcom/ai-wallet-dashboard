import { execFile } from 'node:child_process'
import { toNumber, round } from '../util.mjs'

/**
 * 千问AI平台（platform.qianwenai.com）。
 *
 * 平台没有公开的余额 REST 接口：API Key（sk-ws-…）只能调推理，
 * 查余额/用量必须用官方 CLI 的「管理登录」（OAuth 设备码）。
 *   npm i -g @qianwenai/qianwen-cli
 *   qianwen auth login
 *   qianwen billing balance summary --format json
 *
 * 因此这个适配器是「壳调用」：执行 qianwen 命令并解析 JSON。
 * 找不到 CLI / 未登录时，卡片会显示对应错误，不影响其它平台。
 */
export default {
  id: 'qianwen',
  name: '千问AI平台',
  envKeys: [], // 不需要环境变量，依赖 CLI 的登录态
  requires: 'qianwen CLI（npm i -g @qianwenai/qianwen-cli && qianwen auth login）',
  dashboardUrl: 'https://platform.qianwenai.com/home/billing/overview',
  docs: 'https://platform.qianwenai.com/docs/api-reference/preparation/cli',
  defaultLowBalance: 10,

  async fetchSnapshot({ config = {} }) {
    const command = config.command || 'qianwen'
    const args = config.args || ['billing', 'balance', 'summary', '--format', 'json']
    const stdout = await runCli(command, args, config.timeoutMs ?? 20000)
    let json
    try {
      json = JSON.parse(stdout)
    } catch {
      throw new Error(`qianwen 输出不是 JSON：${stdout.slice(0, 120)}`)
    }
    return parseBalance(json)
  },
}

function runCli(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        if (err.code === 'ENOENT') {
          return reject(new Error('未找到 qianwen 命令，请先 npm i -g @qianwenai/qianwen-cli'))
        }
        if (err.code === 2 || /AUTH_REQUIRED|未登录|not logged in/i.test(stderr || '')) {
          return reject(new Error('qianwen 未登录，请先运行 qianwen auth login'))
        }
        return reject(new Error((stderr || err.message || '').trim().slice(0, 200) || 'qianwen 执行失败'))
      }
      resolve(stdout)
    })
  })
}

/**
 * CLI 的 JSON 结构未在文档中固定，这里按常见字段名做一次「窄兜底」：
 * 只认顶层与 data/balance 一层的已知键，认不出就报错并附上原文，
 * 避免把任意数字误当成余额。
 */
export function parseBalance(json) {
  const root = json?.data ?? json
  const candidates = [
    root?.available,
    root?.availableBalance,
    root?.available_balance,
    root?.balance,
    root?.cashBalance,
    root?.cash_balance,
    root?.amount,
    root?.balance?.available,
    root?.balance?.amount,
  ]
  const value = candidates.find((v) => v !== undefined && v !== null && v !== '' && Number.isFinite(toNumber(v, NaN)))
  if (value === undefined) {
    throw new Error(`无法识别 qianwen 余额结构：${JSON.stringify(json).slice(0, 160)}`)
  }
  const currency = String(root?.currency || root?.balance?.currency || 'CNY').toUpperCase()
  return {
    currency,
    balance: round(toNumber(value)),
    total: round(toNumber(value)),
    reserved: round(toNumber(root?.frozen ?? root?.frozenAmount ?? 0)),
    available: true,
  }
}
