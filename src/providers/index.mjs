import deepseek from './deepseek.mjs'
import routerone from './routerone.mjs'
import qianwen from './qianwen.mjs'
import openai from './openai.mjs'
import anthropic from './anthropic.mjs'
import gemini from './gemini.mjs'

/**
 * 平台适配器注册表。
 *
 * 两种能力：
 *   kind: 'balance' —— 有余额接口，展示余额 / 消耗趋势 / 可用天数
 *   kind: 'usage'   —— 只有账单接口，展示近 N 天花费与今日花费
 *
 * 新增平台：写一个同结构模块，加进数组即可（见 CONTRIBUTING.md）。
 */
export const PROVIDERS = [deepseek, routerone, qianwen, openai, anthropic, gemini]

export function getProviders(ids) {
  if (!ids || ids.length === 0) return PROVIDERS
  return PROVIDERS.filter((p) => ids.includes(p.id))
}
