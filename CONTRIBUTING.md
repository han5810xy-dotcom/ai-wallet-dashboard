# 贡献指南

## 本地开发

```bash
npm test          # 单元测试（node --test，零依赖）
npm run demo      # 用演示数据启动，观察 UI
npm start         # 真实数据（需要先设置环境变量）
```

## 目录结构

```
src/
  cli.mjs            命令入口：serve / snapshot / providers
  server.mjs         HTTP 服务与静态资源，/api/summary
  collector.mjs      调用适配器 → 写快照 → 汇总
  store.mjs          余额快照 JSONL 读写与修剪
  stats.mjs          各窗口净消耗、曲线抽稀
  providers/         平台适配器（新增平台改这里）
public/              前端单页（无构建步骤）
test/                node:test 用例
```

## 新增平台适配器

1. 在 `src/providers/` 新建 `<id>.mjs`，导出 `id / name / envKeys / defaultLowBalance / dashboardUrl / fetchSnapshot`
2. `fetchSnapshot` 返回 `{ currency, balance, total, reserved?, granted?, note? }`
   - `total` 用于趋势曲线，应包含赠送额度、不含 `reserved` 波动
   - 失败直接 `throw`，错误信息会显示在卡片上
3. 在 `src/providers/index.mjs` 的 `PROVIDERS` 注册
4. 在 `README.md` 支持平台表里补一行，附上官方接口文档链接
5. 加测试：参考 `test/store.test.mjs` 里 fake 平台的写法，用注入的 `fetchJson` 避免真实网络

## PR 约定

- 一个 PR 只做一件事（新增平台 / 修 bug / 改 UI）
- 提交前 `npm test` 必须全绿
- 不要提交真实 Key、`data/` 目录、`ai-wallet.config.json`
- 中文注释、英文标识符；面向用户的文案用中文

## 分支与发布

- `main` 始终可运行；功能走 `feat/<平台或模块>`
- 版本遵循 SemVer；`feat` 升 minor，破坏性改动升 major
- 打 tag 后 GitHub Release 附上变更说明
