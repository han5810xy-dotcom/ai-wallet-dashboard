# ai-wallet-dashboard

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A518.17-brightgreen.svg)](https://nodejs.org)
[![tests](https://img.shields.io/badge/tests-38%20passing-brightgreen.svg)](./test)
[![deps](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](./package.json)

本地运行的 **AI 花费看板**：7 家平台的预付余额与按量账单，加 DSH 会话级花费归因，一个页面看完。

零依赖、单命令启动、只监听 `127.0.0.1`，Key 不离开本机。

![看板截图](./docs/preview.png)

## 设计取舍

几个刻意的决定，看代码前先知道会省事：

- **只用余额快照推导消耗，不依赖各家用量 API**——因为大多数平台根本没有这个接口；代价是采样不足两次时显示「数据不足」，而不是 0
- **没有登记单价的模型只报 token**——用别家的价格套算会得到一个错的数字，宁可不给
- **账单型与余额型分开记账**——「还能用几天」和「已经花了多少」不是一个概念，混在一起加总没有意义
- **零依赖、无构建步骤**——`git clone` 就能跑；代价是前端手写原生 JS，没有组件框架

## 为什么

现在用 AI 的人手里通常不止一个平台的余额：

- DeepSeek 开放平台的充值余额（按 token 扣费）
- Router One 这类网关的 USD 预付余额
- 以后还可能有百炼、TokenHub、OpenRouter……

每查一次余额就要登一次控制台，且各家用「余额」而不是「已用 token」计价，很难判断这个月到底烧了多少。这个工具把「查余额」变成一块常驻桌面、自动刷新的看板。

## 特性

- **一个页面看全部**：多平台卡片并排，顶部按币种合计余额、日均消耗与最短可用天数
- **两种卡片**：预付余额型（DeepSeek / Router One / 千问）算「还能用几天」，按量账单型（OpenAI / Anthropic）算「近 30 天花了多少」，分开记账不混在一起
- **一句话结论**：顶部自动生成「按当前消耗，余额还能撑 X 天 · 近 30 天账单 $Y」
- **每日消耗柱状图**：按天聚合消耗与充值，可切换成余额曲线（充值点单独标出）
- **余额预测**：按近 7 日均耗估算「约还剩 N 天」，低于 7 天徽标变黄
- **低余额告警**：告警线可逐平台调整，配浏览器通知
- **数据可带走**：一键导出 CSV（时间、余额、冻结、赠送），丢进 Excel / pandas
- **双主题**：跟随系统 / 深色 / 浅色，设置存本地
- **花费归因**：读 DSH 本地会话缓存，算出「哪个会话花了多少 token、值多少钱」，这是云端控制台看不到的
- **零依赖**：只用 Node 内置模块，`git clone` 即可运行；38 个测试覆盖到 HTTP 路由与归因解析
- **本地优先**：快照存 `data/*.jsonl`，不上传任何数据，不做遥测
- **易扩展**：新增平台 = 写一个二十来行的适配器文件

## 快速开始

要求 Node.js ≥ 18.17（推荐 20+）。

```bash
git clone https://github.com/<you>/ai-wallet-dashboard.git
cd ai-wallet-dashboard

# 1. 配置 Key（PowerShell）
$env:DEEPSEEK_API_KEY = "sk-..."
$env:ROUTER_ONE_API_KEY = "sk-..."

# 2. 启动（自动打开浏览器）
npm start
```

打开 <http://127.0.0.1:8787> 即可。没有 Key 也能先看界面：

```bash
npm run demo     # 演示数据，不发起任何网络请求
```

一次性输出（适合写进脚本 / 定时任务）：

```bash
npm run snapshot           # 人类可读
npm run snapshot -- --json # 机器可读
```

### 桌面化（Windows）

```powershell
# 生成桌面快捷方式（Edge/Chrome 独立窗口，无地址栏）
pwsh -File scripts/install-shortcut.ps1

# 顺便加入开机启动
pwsh -File scripts/install-shortcut.ps1 -Startup
```

脚本会自动找 Edge / Chrome，用 `--app=http://127.0.0.1:8787` 创建快捷方式。macOS 可用 `open -a "Google Chrome" --args --app=http://127.0.0.1:8787`。

## 支持的平台

| id | 平台 | 能力 | 接口 | 币种 |
| --- | --- | --- | --- | --- |
| `deepseek` | DeepSeek 开放平台 | 余额 | `GET https://api.deepseek.com/user/balance` | CNY |
| `routerone` | Router One | 余额 | `GET https://api.router.one/v1/balance` | USD |
| `qianwen` | 千问AI平台 | 余额 | 官方 CLI `qianwen billing balance summary --format json` | CNY |
| `kimi` | Kimi（Moonshot） | 余额 | `GET https://api.moonshot.cn/v1/users/me/balance` | CNY |
| `openai` | OpenAI | 账单 | `GET /v1/organization/costs`（**Admin Key**） | USD |
| `anthropic` | Anthropic Claude | 账单 | `GET /v1/organizations/cost_report`（**Admin Key**） | USD |
| `gemini` | Google Gemini | 余额（手填） | 无公开接口 | USD |

> DeepSeek 的余额接口需要 **API Key**（`sk-...`），不是网页登录态。

### 为什么海外三家长得不一样

这三家**都没有**「预付余额」查询接口，所以看板把它们做成两种卡片：

- **账单型**（OpenAI / Anthropic）：用组织级费用报表，显示「近 30 天账单 + 今日花费」。需要 **Admin Key**（`sk-admin-…` / `sk-ant-admin…`），普通推理 Key 没有权限。
  ```bash
  export OPENAI_ADMIN_KEY=sk-admin-...
  export ANTHROPIC_ADMIN_KEY=sk-ant-admin...
  ```
- **手填型**（Gemini）：Google 只在 Cloud Billing / BigQuery 里给花费数据，个人账号拉不到。所以 `gemini` 是手动余额——你在配置里写一个数，看板照常显示、告警、画趋势，只是需要你自己更新。

账单型没有余额概念，也就没有「还能用几天」；余额型才有。顶部那句结论会把两类分开说。

### 千问AI平台（特殊）

千问没有公开的余额 REST 接口，`sk-ws-…` 这类 API Key 只能调推理，查余额必须走官方 CLI 的**管理登录**：

```bash
npm install -g @qianwenai/qianwen-cli
qianwen auth login                                   # OAuth 设备码，浏览器里点一下
qianwen billing balance summary --format json        # 看板就是调这条
```

看板会直接调用 `qianwen` 命令并解析 JSON；没装或没登录时卡片显示对应提示，不影响其它平台。如果你的 `qianwen` 不在 PATH 里，用配置覆盖：

```json
{ "providers": { "qianwen": { "command": "C:/path/to/qianwen.cmd" } } }
```

它还能查用量，适合后续扩展成"token 消耗"卡片：`qianwen usage summary`、`qianwen usage payg`、`qianwen usage free-tier`。

## 配置

可选配置文件 `ai-wallet.config.json`（或 `--config` 指定）：

```json
{
  "refreshSeconds": 60,
  "dataDir": "./data",
  "providers": {
    "deepseek": { "lowBalance": 20, "currency": "CNY" },
    "routerone": { "lowBalance": 2 }
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `refreshSeconds` | 前端轮询与服务端缓存时长，默认 60 |
| `dataDir` | 快照目录，默认 `./data` |
| `providers.<id>.lowBalance` | 低余额告警线（平台默认值见适配器） |
| `providers.<id>.name` | 覆盖显示名（多账号时有用） |

环境变量优先于配置文件：`DEEPSEEK_API_KEY`、`ROUTER_ONE_API_KEY`、`OPENAI_ADMIN_KEY`、`ANTHROPIC_ADMIN_KEY`、`AI_WALLET_DATA_DIR`、`AI_WALLET_CONFIG`。

平台级可选字段：`name`（显示名）、`lowBalance`（告警线）、`command` / `args` / `timeoutMs`（仅 `qianwen` 这类壳调用型平台）。

## 花费归因（DeepSeek Harness 用户）

看板底部会读 `~/.dsh/storages/session_projcache/sessions/*.json`，把每个 DSH 会话的 token 用量按会话汇总，估算花掉多少钱：

```
合计 190.8M tokens · 估算 ¥18.97
联网搜索美化生涯报告   deepseek-v4-pro   5.9M tokens   ≈ ¥5.46
有毒物质冲击活性污泥…  deepseek-v4-pro   7.3M tokens   ≈ ¥4.73
```

- 单价按官方公开价（`deepseek-flash` 2/0.04/8 元每百万，`deepseek-v4-pro` 9/0.3/27），可在配置里覆盖
- **没登记单价的模型只报 token、不报金额**，避免用别人的价格算出一个错误数字
- 投影缓存只有累计值，所以是按会话归因，不是按天；按天需要解压 `session.v4.jsonl.zstd`，在路线图里
- 不想看这块就关掉：`"attribution": { "enabled": false }`

```json
{
  "attribution": {
    "days": 30,
    "dshDir": "C:/Users/you/.dsh",
    "pricing": { "deepseek-flash": { "input": 2, "cacheRead": 0.04, "output": 8 } }
  }
}
```

## 数据与操作

- 页面每 `refreshSeconds` 秒拉一次 `/api/summary`，同时把一条快照写进 `data/<平台>.jsonl`（保留 90 天）
- 卡片右上「导出 CSV」→ `GET /api/export.csv?provider=<id>`，字段：时间、毫秒时间戳、币种、可用余额、总余额、冻结、赠送
- 快捷键：`R` 刷新、`S` 打开设置、`Esc` 关闭
- 设置（主题 / 刷新间隔 / 告警线 / 通知）存在浏览器 localStorage，不写服务端

## 项目结构

```
src/
  cli.mjs        serve / snapshot / providers 三个子命令
  server.mjs     HTTP 服务、静态资源、/api/summary、/api/export.csv
  collector.mjs  并发采集 → 写快照 → 汇总派生字段
  store.mjs      JSONL 快照读写、90 天修剪
  stats.mjs      24h/7d/30d 净消耗
  daily.mjs      按天聚合与余额预测
  export.mjs     CSV 生成
  providers/     平台适配器（deepseek、routerone、qianwen）
public/          无构建步骤的单页前端
scripts/         Windows 快捷方式安装脚本
test/            node:test 用例（27 个）
```

## 工作原理

各平台普遍只提供「当前余额」，不提供「这段用了多少 token」。因此本项目用**余额快照**推导消耗：

1. 每次刷新向各平台查一次余额，追加一行到 `data/<平台>.jsonl`
2. 同一窗口内 `首个点 - 最后一个点` = 净消耗 − 充值
3. 净值为正 → 记为消耗；净值为负 → 记为充值（充值和消耗同时发生时会互相抵消，所以 UI 文案用「净消耗」）

好处：任何能查余额的平台都能接入，不需要各家的用量 API。代价：采样点不足 2 个时显示「数据不足」；平台在两次采样之间既充值又消耗时，数字会被抹平。

## 新增一个平台

在 `src/providers/` 下新建文件，导出同样结构即可：

```js
// src/providers/example.mjs
import { fetchJson, toNumber, round } from '../util.mjs'

export default {
  id: 'example',
  name: '示例平台',
  envKeys: ['EXAMPLE_API_KEY'],
  dashboardUrl: 'https://example.com/billing',
  defaultLowBalance: 5,

  async fetchSnapshot({ env }) {
    const key = env.EXAMPLE_API_KEY
    if (!key) throw new Error('未配置 EXAMPLE_API_KEY')
    const data = await fetchJson('https://api.example.com/v1/balance', {
      headers: { authorization: `Bearer ${key}` },
    })
    return {
      currency: 'CNY',
      balance: round(toNumber(data.balance)),
      total: round(toNumber(data.balance)), // 趋势用 total 比较，建议含赠送/冻结
      reserved: 0,
    }
  },
}
```

然后在 `src/providers/index.mjs` 的 `PROVIDERS` 数组里加一行，补一个测试（见 `test/store.test.mjs` 的 fake 平台写法）。

## 常见问题

- **401 / invalid token**：Key 填错或已删除；DeepSeek 需要 `api_keys` 页面创建的 Key，不是账号密码。
- **卡片显示「未连接」**：对应环境变量没设置。Windows 里新开终端后 `$env:` 不会自动继承。
- **消耗一直是「数据不足」**：刚启动，至少需要两次采样（默认 1 分钟后）。
- **余额比预期低**：DeepSeek 优先扣赠送余额，Router One 的 `balance` 已含赠送额度，且进行中的请求会临时占用 `reserved_balance`。
- **能查用量（token 数）吗**：本项目只做余额维度；接入各家用量 API 在路线图里。

## 路线图

- [ ] 千问 `usage payg` 接入，展示 token 级消耗而非余额差值
- [ ] 阿里云百炼（OpenAPI 签名）与腾讯云 TokenHub（TC3 签名）
- [ ] OpenAI / Anthropic / OpenRouter 等海外平台
- [ ] 按 token 计费的用量接口接入（有则优先于余额推导）
- [ ] 历史数据导出 CSV、月度账单视图
- [ ] 桌面挂件（Electron / Tauri，可置顶）
- [ ] DSH 插件形态，直接在 Harness 侧边栏显示

## 贡献

见 [CONTRIBUTING.md](./CONTRIBUTING.md)。Issues / PR 都欢迎，新增平台适配器的 PR 最好附上接口文档链接。

## License

[MIT](./LICENSE)
