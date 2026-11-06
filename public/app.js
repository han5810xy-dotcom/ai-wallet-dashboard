const cardsEl = document.getElementById('cards')
const subEl = document.getElementById('sub')
const countdownEl = document.getElementById('countdown')
const refreshBtn = document.getElementById('refresh')

const SYMBOL = { CNY: '¥', USD: '$', EUR: '€', USDT: '₮' }
const WINDOW_LABELS = { h24: '近 24 小时', d7: '近 7 天', d30: '近 30 天' }

let state = { refreshSeconds: 60, nextAt: 0, timer: null }

const money = (value, currency = 'CNY') => {
  const sym = SYMBOL[currency] || `${currency} `
  return `${sym}${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const timeText = (ts) =>
  ts ? new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'

async function load(force = false) {
  refreshBtn.disabled = true
  try {
    const res = await fetch(`/api/summary${force ? '?force=1' : ''}`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    render(data)
    state.refreshSeconds = data.refreshSeconds || 60
    state.nextAt = Date.now() + state.refreshSeconds * 1000
  } catch (err) {
    subEl.textContent = `读取失败：${err.message}`
  } finally {
    refreshBtn.disabled = false
  }
}

function render(data) {
  const items = data.providers || []
  const totals = new Map()
  for (const p of items) {
    if (p.ok && p.total !== null && p.total !== undefined) {
      totals.set(p.currency, (totals.get(p.currency) || 0) + p.total)
    }
  }
  const totalText = [...totals.entries()].map(([cur, v]) => money(v, cur)).join(' · ')
  const when = new Date(data.generatedAt || Date.now()).toLocaleTimeString('zh-CN')
  subEl.textContent = `${items.filter((p) => p.ok).length}/${items.length} 个平台可用${totalText ? ` · 合计 ${totalText}` : ''} · 更新于 ${when}${data.mock ? ' · 演示数据' : ''}`

  cardsEl.replaceChildren(...items.map(card))
  tickCountdown()
}

function card(p) {
  const el = document.createElement('article')
  const low = p.ok && p.lowBalance != null && p.total <= p.lowBalance
  el.className = `card ${!p.ok ? (p.configured ? 'error' : 'empty') : low ? 'warn' : ''}`

  const head = document.createElement('div')
  head.className = 'card-head'
  head.innerHTML = `<span class="dot"></span><h2>${escapeHtml(p.name)}</h2>`
  if (p.dashboardUrl) {
    const a = document.createElement('a')
    a.className = 'link'
    a.href = p.dashboardUrl
    a.target = '_blank'
    a.rel = 'noreferrer'
    a.textContent = '控制台 ↗'
    head.append(a)
  }
  el.append(head)

  const bal = document.createElement('div')
  bal.className = 'balance'
  if (p.ok && p.total != null) {
    bal.innerHTML = `<span class="sym">${SYMBOL[p.currency] || p.currency}</span><span class="num">${Number(p.total).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`
  } else {
    bal.innerHTML = `<span class="num empty">未连接</span>`
  }
  el.append(bal)

  const meta = document.createElement('div')
  meta.className = 'meta'
  if (p.ok) {
    const bits = []
    if (p.balance != null && p.balance !== p.total) bits.push(`可用 ${money(p.balance, p.currency)}`)
    if (p.reserved > 0) bits.push(`冻结 ${money(p.reserved, p.currency)}`)
    if (p.granted > 0) bits.push(`赠送 ${money(p.granted, p.currency)}`)
    meta.innerHTML = low ? `<span class="warn-text">⚠ 低于告警线 ${money(p.lowBalance, p.currency)}</span>` : escapeHtml(bits.join(' · ') || '余额正常')
  } else {
    meta.innerHTML = `<span class="warn-text">${escapeHtml(p.error || '未配置')}</span>`
  }
  el.append(meta)

  if (p.ok) {
    const spends = document.createElement('div')
    spends.className = 'spends'
    for (const key of ['h24', 'd7', 'd30']) {
      const s = p.spend?.[key]
      const cell = document.createElement('div')
      cell.className = 'spend'
      const value = s ? money(s.spent, p.currency) : '数据不足'
      cell.innerHTML = `<div class="k">${WINDOW_LABELS[key]}</div><div class="v ${s ? '' : 'na'}">${value}</div>${s?.toppedUp ? `<div class="topup">含充值 ${money(s.toppedUp, p.currency)}</div>` : ''}`
      spends.append(cell)
    }
    el.append(spends)

    const points = (p.history || []).filter((h) => Number.isFinite(h.total))
    if (points.length >= 2) {
      const spark = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      spark.setAttribute('class', 'spark')
      spark.setAttribute('viewBox', '0 0 300 56')
      spark.setAttribute('preserveAspectRatio', 'none')
      spark.innerHTML = sparkPath(points)
      el.append(spark)
    } else {
      const hint = document.createElement('div')
      hint.className = 'spark-empty'
      hint.textContent = '已采样 1 次，下一次刷新后出现余额曲线'
      el.append(hint)
    }
  }

  const foot = document.createElement('div')
  foot.className = 'card-foot'
  foot.innerHTML = `<span>${p.ok ? `采样 ${p.history?.length || 0} 点 · ${timeText(p.updatedAt)}` : '尚无数据'}</span><span>${p.ok ? '' : ''}</span>`
  el.append(foot)

  return el
}

function sparkPath(history) {
  const pts = history.filter((h) => Number.isFinite(h.total))
  if (pts.length < 2) return ''
  const xs = pts.map((h) => h.t)
  const ys = pts.map((h) => h.total)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const spanX = maxX - minX || 1
  const spanY = maxY - minY || Math.max(maxY * 0.02, 0.01)
  const x = (t) => ((t - minX) / spanX) * 296 + 2
  const y = (v) => 54 - ((v - minY) / spanY) * 50

  const line = pts.map((h, i) => `${i ? 'L' : 'M'}${x(h.t).toFixed(1)},${y(h.total).toFixed(1)}`).join(' ')
  const area = `${line} L296,56 L2,56 Z`
  return `
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#5b9dff" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#5b9dff" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#g)"/>
    <path d="${line}" fill="none" stroke="#5b9dff" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
  `
}

function tickCountdown() {
  const left = Math.max(0, Math.round((state.nextAt - Date.now()) / 1000))
  countdownEl.textContent = left > 0 ? `${left}s 后刷新` : ''
  if (left === 0 && state.nextAt) load(false)
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

refreshBtn.addEventListener('click', () => load(true))
setInterval(tickCountdown, 1000)
load(false)
