import { round } from './util.mjs'

export const WINDOWS = {
  h24: 24 * 60 * 60 * 1000,
  d7: 7 * 24 * 60 * 60 * 1000,
  d30: 30 * 24 * 60 * 60 * 1000,
}

/**
 * 由快照序列估算各时间窗口的净消耗。
 * 返回 null 表示样本不足（窗口内少于 2 个点），UI 应显示“数据不足”而不是 0。
 */
export function spendStats(history, now = Date.now(), field = 'total') {
  const out = {}
  for (const [key, span] of Object.entries(WINDOWS)) {
    const win = history.filter((h) => h.t >= now - span && Number.isFinite(h[field]))
    if (win.length < 2) {
      out[key] = null
      continue
    }
    const first = win[0][field]
    const last = win[win.length - 1][field]
    const delta = first - last
    out[key] = {
      spent: round(Math.max(0, delta)),
      toppedUp: round(Math.max(0, -delta)),
      samples: win.length,
      from: win[0].t,
      to: win[win.length - 1].t,
    }
  }
  return out
}

/** 把历史点抽稀到最多 maxPoints 个，减小首屏体积 */
export function downsample(history, maxPoints = 120) {
  if (history.length <= maxPoints) return history
  const step = (history.length - 1) / (maxPoints - 1)
  return Array.from({ length: maxPoints }, (_, i) => history[Math.round(i * step)])
}
