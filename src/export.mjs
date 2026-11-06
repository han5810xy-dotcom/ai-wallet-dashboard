/**
 * 快照导出为 CSV，方便丢进 Excel / pandas 做自己的分析。
 * 只导出原始采样点（时间、余额），不做任何聚合，避免口径争议。
 */

const COLUMNS = ['time', 'timestamp', 'currency', 'balance', 'total', 'reserved', 'granted']

function escapeCell(value) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows) {
  const lines = [COLUMNS.join(',')]
  for (const row of rows) {
    lines.push(
      [
        new Date(row.t).toISOString(),
        row.t,
        row.currency || '',
        row.balance ?? row.total ?? '',
        row.total ?? '',
        row.reserved ?? '',
        row.granted ?? '',
      ]
        .map(escapeCell)
        .join(','),
    )
  }
  return lines.join('\n') + '\n'
}
