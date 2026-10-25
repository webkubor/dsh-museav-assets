# AGENTS.md — AI 助手工作守则

## 这是什么

MUSE AV 资产台 —— DeepSeek Harness 插件（`@dsh-plugins/dsh-museav-assets`）：
在 DSH 主区加一个「资产」tab，按项目（工作区）看 MUSE AV 的素材库与最近出图，
点素材复制直链，直接当垫图用（`museav gen --ref <url>`）。

## 关键文件

- `lib/`：构建产物（发布到 npm 的就是它），**不要手改**；源码用 TypeScript 构建。
- `cordis.patch.yml`：DSH 插件打包契约 —— 改包名 / 入口 / 文件白名单必须同步它。
- `scripts/`：构建与检查脚本；`npm run check` 是发布前门禁。
- `test/`：契约测试。

## 常用命令

```bash
npm run check     # 发布前门禁（打包契约 + 测试）
npm run test      # 测试
npm run deploy    # 部署到本机 DSH profile
```

## 约定

- 只读本地 MUSE AV 的工作区数据，不引入云端依赖。
- 版本与 CHANGELOG 走 release-please（见 `release-please-config.json`），不手改历史。
- lib/ 是生成物：改动一律走源码 + 构建。
