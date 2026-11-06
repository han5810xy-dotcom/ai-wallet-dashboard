/**
 * 通用工具：带超时的 JSON 请求、数值格式化。
 * 不做重试——余额查询是幂等读，失败交给上层显示，避免掩盖 401 这类真问题。
 */

export async function fetchJson(url, { headers = {}, timeoutMs = 15000, method = 'GET' } = {}, fetchImpl = globalThis.fetch) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`请求超时（${timeoutMs}ms）`)), timeoutMs)
  try {
    const res = await fetchImpl(url, {
      method,
      headers: {
        'user-agent': 'ai-wallet-dashboard/0.1 (+https://github.com/)',
        accept: 'application/json',
        ...headers,
      },
      signal: controller.signal,
    })
    const text = await res.text()
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      // 上游偶尔返回 HTML 错误页，保留原文方便排查
    }
    if (!res.ok) {
      const detail = data?.error?.message || data?.message || (text || '').slice(0, 200) || `HTTP ${res.status}`
      const err = new Error(`HTTP ${res.status}：${detail}`)
      err.status = res.status
      err.body = data ?? text
      throw err
    }
    if (data === null) throw new Error('响应不是合法 JSON')
    return data
  } finally {
    clearTimeout(timer)
  }
}

export function toNumber(value, fallback = 0) {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  return Number.isFinite(n) ? n : fallback
}

export function round(value, digits = 2) {
  const p = 10 ** digits
  return Math.round((toNumber(value) + Number.EPSILON) * p) / p
}
