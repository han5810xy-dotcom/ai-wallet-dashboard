const $ = (sel) => document.querySelector(sel)

const SYMBOL = { CNY: '¥', USD: '$', EUR: '€', USDT: '₮' }
const WINDOWS = { h24: '近 24 小时', d7: '近 7 天', d30: '近 30 天' }
const STORE_KEY = 'aiwallet.settings'

const DEFAULT_SETTINGS = { theme: 'auto', interval: 60, lowBalance: {}, notify: false }

const state = {
  data: null,
  chartMode: localStorage.getItem('aiwallet.chartMode') || 'spend',
  nextAt: 0,
  notified: new Set(),
  busy: false,
}

let settings = loadSettings()

/* ---------------- settings ---------------- */

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function saveSettings(patch) {
  settings = { ...settings, ...patch }
  localStorage.setItem(STORE_KEY, JSON.stringify(settings))
}

function applyTheme() {
  const mode = settings.theme === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : settings.theme
  document.documentElement.dataset.theme = mode
  $('#theme').textContent = mode === 'light' ? '☀' : '◐'
}

/* ---------------- formatting ---------------- */

const money = (value, currency = 'CNY') => {
  const sym = SYMBOL[currency] || `${currency} `
  return `${sym}${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
const timeText = (ts) => (ts ? new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '—')
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/* ---------------- data ---------------- */

async function load(force = false) {
  if (state.busy) return
  state.busy = true
  $('#refresh').disabled = true
  try {
    const res = await fetch(`/api/summary${force ? '?force=1' : ''}`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    state.data = await res.json()
    render(state.data)
    state.nextAt = Date.now() + (state.data.refreshSeconds || settings.interval) * 1000
  } catch (err) {
    toast(`读取失败：${err.message}`)
  } finally {
    state.busy = false
    $('#refresh').disabled = false
  }
}

/* ---------------- render ---------------- */

function render(data) {
  const items = data.providers || []
  const online = items.filter((p) => p.ok).length
  const when = new Date(data.generatedAt || Date.now()).toLocaleTimeString('zh-CN')
  $('#sub').textContent = `${online}/${items.length} 个平台在线 · 更新于 ${when}${data.mock ? ' · 演示数据' : ''}`

  renderTotals(items)
  $('#cards').replaceChildren(...(items.length ? items.map(card) : [emptyState()]))

  if (state.chartMode === 'spend') {
    // 保留用户选择
    localStorage.setItem('aiwallet.chartMode', state.chartMode)
  }
  checkNotifications(items)
  renderDrawer(items)
  tick()
}

function renderTotals(items) {
  const groups = new Map()
  for (const p of items) {
    if (!p.ok || p.total === null || p.total === undefined) continue
    const g = groups.get(p.currency) || { total: 0, avg: 0, days: null, count: 0 }
    g.total += p.total
    g.count += 1
    if (p.forecast) {
      g.avg += p.forecast.avgDaily
      if (p.forecast.daysLeft !== null) {
        g.days = g.days === null ? p.forecast.daysLeft : Math.min(g.days, p.forecast.daysLeft)
      }
    }
    groups.set(p.currency, g)
  }

  const cells = [...groups.entries()].map(([currency, g]) => `
    <div class="total">
      <div class="k">${escapeHtml(currency)} 合计 · ${g.count} 个平台</div>
      <div class="v">${money(g.total, currency)}</div>
      <div class="s">${g.avg ? `日均 ${money(g.avg, currency)} · 约 ${g.days ?? '—'} 天` : '暂无消耗样本'}</div>
    </div>`)

  if (!cells.length) cells.push(`<div class="total"><div class="k">合计</div><div class="v">—</div><div class="s">还没有可用的平台</div></div>`)
  $('#totals').innerHTML = cells.join('')
}

function emptyState() {
  const el = document.createElement('div')
  el.className = 'card empty'
  el.innerHTML = `<div class="card-head"><span class="dot"></span><h2>还没有平台</h2></div>
    <div class="meta">在 <code>ai-wallet.config.json</code> 配置环境变量或平台后刷新。</div>`
  return el
}

/* ---------------- card ---------------- */

function card(p) {
  const el = document.createElement('article')
  const threshold = settings.lowBalance[p.id] ?? p.lowBalance
  const low = p.ok && threshold != null && p.total <= threshold
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
    const days = p.forecast?.daysLeft
    const badge = days == null ? '' : `<span class="badge ${days < 7 ? 'warn' : 'ok'}">约 ${days} 天</span>`
    bal.innerHTML = `<span class="sym">${SYMBOL[p.currency] || p.currency}</span>
      <span class="num">${Number(p.total).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>${badge}`
  } else {
    bal.innerHTML = `<span class="num empty">未连接</span>`
  }
  el.append(bal)

  const meta = document.createElement('div')
  meta.className = 'meta'
  if (p.ok) {
    const bits = []
    if (p.granted > 0) bits.push(`赠送 ${money(p.granted, p.currency)}`)
    if (p.reserved > 0) bits.push(`冻结 ${money(p.reserved, p.currency)}`)
    if (p.forecast) bits.push(`日均 ${money(p.forecast.avgDaily, p.currency)} · 月耗约 ${money(p.forecast.monthly, p.currency)}`)
    meta.innerHTML = low
      ? `<span class="warn-text">⚠ 低于告警线 ${money(threshold, p.currency)}</span>`
      : escapeHtml(bits.join(' · ') || p.note || '余额正常')
  } else {
    meta.innerHTML = `<span class="warn-text">${escapeHtml(p.error || '未配置')}</span>`
  }
  el.append(meta)

  if (p.ok) {
    const stats = document.createElement('div')
    stats.className = 'stats'
    for (const key of ['h24', 'd7', 'd30']) {
      const s = p.spend?.[key]
      stats.insertAdjacentHTML(
        'beforeend',
        `<div class="stat"><div class="k">${WINDOWS[key]}</div>
         <div class="v ${s ? '' : 'na'}">${s ? money(s.spent, p.currency) : '数据不足'}</div>
         ${s?.toppedUp ? `<div class="extra">充值 ${money(s.toppedUp, p.currency)}</div>` : ''}</div>`,
      )
    }
    el.append(stats)

    const bar = document.createElement('div')
    bar.className = 'chart-bar'
    bar.innerHTML = `<div class="seg">
        <button data-mode="spend" class="${state.chartMode === 'spend' ? 'on' : ''}">消耗</button>
        <button data-mode="balance" class="${state.chartMode === 'balance' ? 'on' : ''}">余额</button>
      </div><span class="chart-max">${chartCaption(p)}</span>`
    bar.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        state.chartMode = b.dataset.mode
        localStorage.setItem('aiwallet.chartMode', state.chartMode)
        render(state.data)
      }),
    )
    el.append(bar)

    el.insertAdjacentHTML('beforeend', state.chartMode === 'balance' ? balanceChart(p) : spendChart(p))
  }

  const foot = document.createElement('div')
  foot.className = 'card-foot'
  foot.innerHTML = `<span>${p.ok ? `采样 ${p.history?.length || 0} 点 · ${timeText(p.updatedAt)}` : '尚无数据'}</span>
    ${p.ok ? `<a href="/api/export.csv?provider=${encodeURIComponent(p.id)}">导出 CSV</a>` : ''}`
  el.append(foot)

  return el
}

/* ---------------- charts ---------------- */

function chartCaption(p) {
  if (state.chartMode === 'balance') {
    const pts = (p.history || []).filter((h) => Number.isFinite(h.total))
    if (pts.length < 2) return ''
    return `当前 ${money(p.total, p.currency)}`
  }
  const days = (p.daily || []).filter((d) => d.spend > 0)
  if (!days.length) return ''
  const max = Math.max(...days.map((d) => d.spend))
  return `峰值 ${money(max, p.currency)}`
}

function spendChart(p) {
  const all = p.daily || []
  const firstWithData = all.findIndex((d) => d.spend > 0 || d.balance != null)
  const daily = firstWithData > 0 ? all.slice(firstWithData) : all
  if (!daily.some((d) => d.spend > 0)) {
    return `<div class="chart-empty">还没有消耗样本，跑几次调用后再看</div>`
  }

  const W = 300
  const H = 64
  const pad = 3
  const max = Math.max(...daily.map((d) => d.spend), 0.01)
  const slot = (W - pad * 2) / daily.length
  const barW = Math.min(26, Math.max(5, slot * 0.56))

  const bars = daily
    .map((d, i) => {
      const h = (d.spend / max) * (H - 14)
      const x = pad + i * slot + (slot - barW) / 2
      const y = H - 6 - h
      const isLast = i === daily.length - 1
      const topup = d.toppedUp
        ? `<circle cx="${(x + barW / 2).toFixed(1)}" cy="${H - 2.5}" r="1.8" fill="var(--ok)"><title>${d.label} 充值 ${d.toppedUp.toFixed(2)}</title></circle>`
        : ''
      return `<g><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(h, 1.5).toFixed(1)}" rx="2.5"
          fill="var(--accent)" opacity="${isLast ? 1 : 0.55}">
          <title>${d.label} · 消耗 ${d.spend.toFixed(2)}${d.toppedUp ? ` · 充值 ${d.toppedUp.toFixed(2)}` : ''}</title>
        </rect>${topup}</g>`
    })
    .join('')

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="近期每日消耗">${bars}</svg>`
}

function balanceChart(p) {
  const pts = (p.history || []).filter((h) => Number.isFinite(h.total))
  if (pts.length < 2) return `<div class="chart-empty">已采样 1 次，下一次刷新后出现余额曲线</div>`

  const W = 300
  const H = 62
  const xs = pts.map((h) => h.t)
  const ys = pts.map((h) => h.total)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const spanX = maxX - minX || 1
  const spanY = Math.max(...ys) - minY || Math.max(minY || 1, 1) * 0.02
  const x = (t) => ((t - minX) / spanX) * (W - 4) + 2
  const y = (v) => H - 4 - ((v - minY) / spanY) * (H - 14)

  const line = pts.map((h, i) => `${i ? 'L' : 'M'}${x(h.t).toFixed(1)},${y(h.total).toFixed(1)}`).join(' ')
  const area = `${line} L${W - 2},${H} L2,${H} Z`

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="余额曲线">
    <defs><linearGradient id="g-${p.id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#g-${p.id})"/>
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`
}

/* ---------------- drawer ---------------- */

function renderDrawer(items) {
  const box = $('#thresholds')
  box.replaceChildren(
    ...items.map((p) => {
      const row = document.createElement('div')
      row.className = 'threshold-row'
      row.innerHTML = `<span>${escapeHtml(p.name)}</span>`
      const input = document.createElement('input')
      input.type = 'number'
      input.min = '0'
      input.step = '0.01'
      input.value = settings.lowBalance[p.id] ?? p.lowBalance ?? ''
      input.addEventListener('change', () => {
        const v = Number(input.value)
        if (Number.isFinite(v) && v >= 0) saveSettings({ lowBalance: { ...settings.lowBalance, [p.id]: v } })
        render(state.data)
      })
      row.append(input)
      return row
    }),
  )

  const exports = $('#exports')
  exports.replaceChildren(
    ...items.map((p) => {
      const a = document.createElement('a')
      a.href = `/api/export.csv?provider=${encodeURIComponent(p.id)}`
      a.textContent = `${p.name} CSV`
      return a
    }),
  )
}

function openDrawer(open) {
  $('#drawer').classList.toggle('open', open)
  $('#drawer').setAttribute('aria-hidden', String(!open))
  $('#scrim').hidden = !open
}

/* ---------------- notifications ---------------- */

function checkNotifications(items) {
  if (!settings.notify || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  for (const p of items) {
    if (!p.ok) continue
    const threshold = settings.lowBalance[p.id] ?? p.lowBalance
    if (threshold == null || p.total > threshold) continue
    if (state.notified.has(p.id)) continue
    state.notified.add(p.id)
    new Notification('AI 钱包余额偏低', {
      body: `${p.name} 当前 ${money(p.total, p.currency)}，低于告警线 ${money(threshold, p.currency)}`,
      tag: `wallet-${p.id}`,
    })
  }
}

/* ---------------- misc ---------------- */

let toastTimer = null
function toast(text) {
  let el = document.querySelector('.toast')
  if (!el) {
    el = document.createElement('div')
    el.className = 'toast'
    document.body.append(el)
  }
  el.textContent = text
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600)
}

function tick() {
  const left = Math.max(0, Math.round((state.nextAt - Date.now()) / 1000))
  const interval = state.data?.refreshSeconds || settings.interval
  if (left > 0 && left < interval) document.title = `(${left}s) AI 钱包看板`
  else document.title = 'AI 钱包看板'
  if (left === 0 && state.nextAt) load(false)
}

/* ---------------- wiring ---------------- */

$('#refresh').addEventListener('click', () => load(true))
$('#settings').addEventListener('click', () => openDrawer(true))
$('#close-drawer').addEventListener('click', () => openDrawer(false))
$('#scrim').addEventListener('click', () => openDrawer(false))
$('#theme').addEventListener('click', () => {
  const next = settings.theme === 'light' ? 'dark' : settings.theme === 'dark' ? 'auto' : 'light'
  saveSettings({ theme: next })
  applyTheme()
  toast(`外观：${next === 'auto' ? '跟随系统' : next === 'dark' ? '深色' : '浅色'}`)
})

$('#set-interval').addEventListener('change', (e) => {
  const interval = Number(e.target.value)
  saveSettings({ interval })
  $('#set-interval').value = String(interval)
  state.nextAt = Date.now() + interval * 1000
  load(true)
})

$('#set-theme').addEventListener('change', (e) => {
  saveSettings({ theme: e.target.value })
  applyTheme()
})

$('#notify').addEventListener('click', async () => {
  if (typeof Notification === 'undefined') return toast('当前浏览器不支持通知')
  const perm = await Notification.requestPermission()
  if (perm === 'granted') {
    saveSettings({ notify: true })
    toast('已开启低余额通知')
  } else {
    toast('通知权限被拒绝')
  }
})

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return
  if (e.key === 'r') load(true)
  if (e.key === 's') openDrawer(true)
  if (e.key === 'Escape') openDrawer(false)
})

window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (settings.theme === 'auto') applyTheme()
})

/* ---------------- boot ---------------- */

applyTheme()
$('#set-theme').value = settings.theme
$('#set-interval').value = String(settings.interval)
setInterval(tick, 1000)
load(false)
