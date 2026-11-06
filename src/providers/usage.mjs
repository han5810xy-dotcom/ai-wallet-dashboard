const DAY = 24 * 60 * 60 * 1000

export function startOfUtcDay(ts) {
  const d = new Date(ts)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/**
 * 把「按天分桶的费用」聚合成近 N 天与今天两个数字。
 * 各家的桶结构不同，用 tsOf / amountOf 注入取值方式，
 * 金额既可能是 {value, currency} 也可能是 "0.12" 字符串。
 */
export function summarizeBuckets(buckets, { tsOf, amountOf, todayStart }) {
  let total = 0
  let today = 0
  let currency = 'USD'
  let count = 0

  for (const bucket of buckets || []) {
    const ts = tsOf(bucket)
    const amount = amountOf(bucket)
    if (!Number.isFinite(ts) || !Number.isFinite(amount)) continue
    total += amount
    if (ts >= todayStart) today += amount
    count += 1
    if (bucket?.currency) currency = String(bucket.currency).toUpperCase()
  }

  return {
    currency,
    periodSpend: Math.round(total * 100) / 100,
    todaySpend: Math.round(today * 100) / 100,
    buckets: count,
    updatedTo: Date.now(),
  }
}

export { DAY }
