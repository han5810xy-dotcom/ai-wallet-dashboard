import { mkdir, readFile, appendFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000

/**
 * 余额快照仓库：每个平台一个 JSONL 文件，一行一个采样点。
 * 为什么只存"余额"也能算消耗：余额只会在充值（上升）和调用（下降）时变化，
 * 同一采样窗口内 首尾差值 = 净消耗 - 充值，配合充值识别即可得到"净消耗"。
 * 优点是不依赖各家私有的用量接口，任何能查余额的平台都能直接接入。
 */
export class SnapshotStore {
  constructor(dir) {
    this.dir = dir
  }

  file(providerId) {
    return path.join(this.dir, `${providerId}.jsonl`)
  }

  async append(providerId, snapshot, ts = Date.now()) {
    await mkdir(this.dir, { recursive: true })
    const line = JSON.stringify({ t: ts, ...snapshot }) + '\n'
    await appendFile(this.file(providerId), line, 'utf8')
  }

  async read(providerId, now = Date.now()) {
    let text
    try {
      text = await readFile(this.file(providerId), 'utf8')
    } catch (err) {
      if (err.code === 'ENOENT') return []
      throw err
    }
    const rows = []
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      try {
        const row = JSON.parse(line)
        if (typeof row.t === 'number' && now - row.t <= MAX_AGE_MS) rows.push(row)
      } catch {
        // 写一半断电之类的坏行直接跳过，不阻塞其它数据
      }
    }
    return rows.sort((a, b) => a.t - b.t)
  }

  /** 修剪 90 天前的旧点，保持文件不会无限增长 */
  async prune(providerId, now = Date.now()) {
    const rows = await this.read(providerId, now)
    const file = this.file(providerId)
    const tmp = `${file}.tmp`
    await writeFile(tmp, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), 'utf8')
    await rename(tmp, file)
  }
}
