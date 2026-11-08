# AGENTS.md — AI 助手工作守则

## 这是什么

Museav 工作台 —— DeepSeek Harness 插件（`@dsh-plugins/dsh-museav-assets`）：
从全局侧栏打开独立主区，浏览公开灵感和可用模型，使用本机 CLI 出图并按项目管理素材和作品。

## 关键文件

- `lib/`：构建产物（发布到 npm 的就是它），**不要手改**；源码用 TypeScript 构建。
- `cordis.patch.yml`：DSH 插件打包契约 —— 改包名 / 入口 / 文件白名单必须同步它。
- `scripts/`：构建与检查脚本；`npm run check` 是发布前门禁。
- `test/`：契约测试。

## 常用命令

```bash
npm run check     # 发布前门禁（打包契约 + 测试）
npm run test      # 测试
npm run check:dsh # 宿主契约门禁（真 cordis 内核跑 apply）
npm run deploy    # 门禁 → 备份 → 装进 desktop；禁止手写 rsync 进 profile
npm run rollback  # 桌面端起不来时回滚
```

## 约定

- 项目、素材、模型和生成能力通过本机 museav CLI；公开灵感库按 owner 要求只读访问 MUSE AV 官方公开接口，不转发账户凭据。不得把公开数据接口扩展为任意 URL 代理。
- 版本与 CHANGELOG 走 release-please（见 `release-please-config.json`），不手改历史。
- lib/ 是生成物：改动一律走源码 + 构建。
