# Changelog

## 0.1.1

- 发布到 npm（0.1.0 是首个版本，本次只补文档与版本号）
- README 中英：删掉「还没发 npm，所以桌面端装不上」的过渡说明，改成已发布状态 +
  桌面端在应用内插件管理里装（CLI 装不进 app 独占托管的 `desktop` profile）
- 加 `.github/workflows/publish.yml`：push `v*` tag → GitHub OIDC Trusted Publishing
  直发 npm（不需要 npm token/OTP）；加 `ci.yml`：语法检查 + 43 个测试 + 打包自检

## 0.1.0

首个版本。

- `conversation.view` 注册第 6 个 tab「资产」（order 40）：项目切换 + 素材网格 + 最近出图
- 4 条路由：health / projects(GET、POST) / assets / jobs
- 适配层锁死 museav-cli 的 stdout 契约（projects→id 换行、assets→`id\turl`、jobs→JSON 数组），
  stderr 表格只补展示字段，解析失败降级不白屏
- 新建项目带上限保护：已达 5 个（服务端上限）时按钮禁用并提示
- 28 个测试：12 解析契约（真机输出夹具）+ 8 路由（stub CLI，不联网）+ 8 UI

### 没做的

- 不出图、不传文件（走 `mcp__museav__*`）
- 不轮询、不缓存
- 不注册 agent 工具（项目相关的工具在 v0.2 考虑）
