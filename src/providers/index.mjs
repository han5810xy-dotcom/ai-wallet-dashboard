import deepseek from './deepseek.mjs'
import routerone from './routerone.mjs'

/**
 * 平台适配器注册表。
 * 新增平台只需写一个同结构的模块，然后加进 PROVIDERS 数组；
 * 每个适配器必须导出：id / name / envKeys / fetchSnapshot(ctx)。
 */
export const PROVIDERS = [deepseek, routerone]

export function getProviders(ids) {
  if (!ids || ids.length === 0) return PROVIDERS
  return PROVIDERS.filter((p) => ids.includes(p.id))
}
