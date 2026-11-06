#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { SnapshotStore } from './store.mjs'
import { Collector } from './collector.mjs'
import { startServer } from './server.mjs'

const HELP = `ai-wallet —— 本地 AI 钱包看板

用法：
  ai-wallet serve [--port 8787] [--mock] [--config <文件>] [--no-open]
  ai-wallet snapshot [--json]             一次性输出各平台余额（适合 cron / 脚本）
  ai-wallet providers                     列出已支持的平台

环境变量：
  DEEPSEEK_API_KEY        DeepSeek 开放平台 API Key
  ROUTER_ONE_API_KEY      Router One API Key
  AI_WALLET_DATA_DIR      快照目录（默认 ./data）
  AI_WALLET_CONFIG        配置文件路径（默认 ./ai-wallet.config.json）

千问AI平台走官方 CLI 的登录态，无需环境变量：
  npm i -g @qianwenai/qianwen-cli && qianwen auth login

配置文件示例：
  { "refreshSeconds": 60, "providers": { "deepseek": { "lowBalance": 20 } } }
`

function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--port') out.port = Number(argv[++i])
    else if (a === '--host') out.host = argv[++i]
    else if (a === '--config') out.config = argv[++i]
    else if (a === '--mock') out.mock = true
    else if (a === '--json') out.json = true
    else if (a === '--no-open') out.open = false
    else if (a === '--help' || a === '-h') out.help = true
    else if (!a.startsWith('-')) out._.push(a)
  }
  return out
}

async function loadConfig(file) {
  const target = file || process.env.AI_WALLET_CONFIG || 'ai-wallet.config.json'
  try {
    return JSON.parse(await readFile(target, 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') return {}
    throw new Error(`配置文件解析失败（${target}）：${err.message}`)
  }
}

function makeCollector(config, mock) {
  const dir = process.env.AI_WALLET_DATA_DIR || config.dataDir || path.join(process.cwd(), 'data')
  return new Collector({ store: new SnapshotStore(dir), config, mock })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const cmd = args._[0] || 'serve'

  if (args.help || cmd === 'help') {
    console.log(HELP)
    return
  }

  if (cmd === 'providers') {
    const { PROVIDERS } = await import('./providers/index.mjs')
    for (const p of PROVIDERS) console.log(`${p.id.padEnd(12)} ${p.name.padEnd(16)} ${p.envKeys.join(', ')}`)
    return
  }

  const config = await loadConfig(args.config)
  const collector = makeCollector(config, args.mock)

  if (cmd === 'snapshot') {
    const data = await collector.collect()
    if (args.json) {
      console.log(JSON.stringify(data, null, 2))
      return
    }
    for (const p of data.providers) {
      const money = p.balance === null ? '—' : `${p.currency === 'USD' ? '$' : '¥'}${p.balance.toFixed(2)}`
      console.log(`${p.name.padEnd(16)} ${money.padStart(12)}  ${p.ok ? '' : '⚠ ' + (p.error || '')}`)
    }
    return
  }

  if (cmd !== 'serve') {
    console.error(`未知命令：${cmd}\n`)
    console.log(HELP)
    process.exitCode = 1
    return
  }

  const port = args.port || config.port || 8787
  const { url } = await startServer({ collector, refreshSeconds: config.refreshSeconds ?? 60, port, host: '127.0.0.1' })
  console.log(`ai-wallet 已启动：${url}${args.mock ? '（演示数据）' : ''}`)
  console.log('Ctrl+C 退出')
  if (args.open !== false) openBrowser(url)
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`
  import('node:child_process').then(({ exec }) => exec(cmd, () => {})).catch(() => {})
}

main().catch((err) => {
  console.error(err?.message || err)
  process.exitCode = 1
})
