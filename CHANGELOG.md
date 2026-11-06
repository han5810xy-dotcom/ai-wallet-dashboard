# 变更日志

本项目遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [0.2.0] - 2026-11-06

### 新增

- **每日消耗**：按天聚合快照，得到「当日消耗 / 当日充值 / 日终余额」，卡片新增 14 天柱状图（可切换余额曲线）
- **余额预测**：按近 7 日均耗估算日均消耗、月耗与「约还剩 N 天」，随余额展示徽标
- **汇总面板**：按币种合计余额、日均消耗与最短可用天数
- **导出 CSV**：`GET /api/export.csv?provider=<id>`，直接丢进 Excel / pandas
- **设置抽屉**：刷新间隔、外观（跟随系统 / 深色 / 浅色）、各平台告警线、低余额浏览器通知
- **桌面快捷方式**：`scripts/install-shortcut.ps1` 一条命令生成 Edge/Chrome 独立窗口快捷方式，可加入开机启动
- 千问AI平台适配器（官方 CLI 壳调用，`qianwen billing balance summary`）

### 改进

- 卡片改为浅/深双主题，配色改用 CSS 变量
- 未连接、采样不足、无消耗等状态分别有独立展示，不再出现空白图表
- 服务端统一补齐 `daily` / `forecast` 派生字段，三个返回分支结构一致

### 测试

- 用例 11 → 27：新增按天聚合、预测、CSV 转义、HTTP 路由与路径穿越防护、千问 CLI 解析

## [0.1.0] - 2026-11-06

### 新增

- DeepSeek（`/user/balance`）与 Router One（`/v1/balance`）余额接入
- 本地快照存储（JSONL，90 天滚动）与 24h / 7d / 30d 净消耗统计
- 零依赖 Node 服务 + 单页看板，60 秒自动刷新
- `serve` / `snapshot` / `providers` 三个 CLI 子命令
