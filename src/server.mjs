import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
}

/**
 * 本地看板服务。
 * - GET /api/summary  → 各平台余额 + 消耗 + 历史点（带 refreshSeconds 级缓存）
 * - GET /            → 单页看板
 * 只监听 127.0.0.1：余额属于敏感信息，不对外网暴露。
 */
export function createApp({ collector, refreshSeconds = 60 }) {
  let cache = null
  let inflight = null

  async function summary(force = false) {
    const fresh = cache && Date.now() - cache.at < refreshSeconds * 1000
    if (!force && fresh) return cache.data
    if (inflight) return inflight
    inflight = collector
      .collect()
      .then((data) => {
        cache = { at: Date.now(), data }
        return data
      })
      .finally(() => {
        inflight = null
      })
    return inflight
  }

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1')
    try {
      if (url.pathname === '/api/summary') {
        const data = await summary(url.searchParams.get('force') === '1')
        return sendJson(res, 200, data)
      }
      if (url.pathname === '/healthz') {
        return sendJson(res, 200, { ok: true })
      }
      return await serveStatic(url.pathname, res)
    } catch (err) {
      return sendJson(res, 500, { error: err?.message || String(err) })
    }
  }
}

async function serveStatic(pathname, res) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '')
  const target = path.resolve(PUBLIC_DIR, rel)
  if (!target.startsWith(PUBLIC_DIR + path.sep) && target !== PUBLIC_DIR) {
    return sendJson(res, 403, { error: 'forbidden' })
  }
  try {
    const body = await readFile(target)
    res.writeHead(200, {
      'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
    })
    res.end(body)
  } catch (err) {
    if (err.code === 'ENOENT') return sendJson(res, 404, { error: 'not found' })
    throw err
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

export function startServer(options) {
  const app = createApp(options)
  const server = http.createServer(app)
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? 8787, options.host ?? '127.0.0.1', () => {
      const addr = server.address()
      resolve({ server, url: `http://${options.host ?? '127.0.0.1'}:${addr.port}` })
    })
  })
}
