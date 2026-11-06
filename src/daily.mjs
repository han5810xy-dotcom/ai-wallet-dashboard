/**
 * 按天聚合余额快照，得到「每日消耗 / 每日充值 / 日终余额」。
 *
 * 为什么按相邻两点差值累加，而不是「日初 - 日末」：
 * 同一天里既充值又调用时，首尾差会把充值抹掉；拆成逐段增量后
 * 下降段计入消耗、上升段计入充值，两者都能保留。
 */

const DAY = 24 * 60 * 60 * 1000

function dayKey(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function dailySeries(history, { days = 14, now = Date.now(), field = 'total' } = {}) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const first = start.getTime() - (days - 1) * DAY

  /** @type {Map<string, {spend:number, toppedUp:number, endBalance:number}]} */
  const buckets = new Map()
  for (let i = 0; i < days; i += 1) {
    buckets.set(dayKey(first + i * DAY), { spend: 0, toppedUp: 0, endBalance: 0 })
  }

  for (let i = 1; i < history.length; i += 1) {
    const prev = history[i - 1]
    const cur = history[i]
    if (!Number.isFinite(prev[field]) || !Number.isFinite(cur[field])) continue
    if (cur.t < first) continue
    const bucket = buckets.get(dayKey(cur.t))
    if (!bucket) continue
    const delta = prev[field] - cur[field]
    if (delta > 0) bucket.spend += delta
    else if (delta < 0) bucket.toppedUp += -delta
    bucket.endBalance = cur[field]
  }

  // 补上没采样的日子：沿用上一天的日终余额，消耗记 0
  let lastBalance = null
  return [...buckets.entries()].map(([date, b]) => {
    lastBalance = b.endBalance || lastBalance
    return {
      date,
      label: date.slice(5),
      spend: Math.round(b.spend * 100) / 100,
      toppedUp: Math.round(b.toppedUp * 100) / 100,
      balance: lastBalance === null ? null : Math.round(lastBalance * 100) / 100,
    }
  })
}

/**
 * 按最近 N 天的日均消耗估算「还能用几天」。
 * 没有足够样本或消耗为 0 时返回 null，UI 显示「—」而不是 Infinity。
 */
export function forecast(balance, daily, { windowDays = 7 } = {}) {
  const recent = daily.slice(-windowDays).filter((d) => d.spend > 0)
  if (!Number.isFinite(balance) || recent.length === 0) return null
  const totalSpend = recent.reduce((sum, d) => sum + d.spend, 0)
  const avg = totalSpend / windowDays
  if (avg <= 0) return null
  return {
    avgDaily: Math.round(avg * 100) / 100,
    daysLeft: Math.round((balance / avg) * 10) / 10,
    monthly: Math.round(avg * 30 * 100) / 100,
  }
}
