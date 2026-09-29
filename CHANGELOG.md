# Changelog

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
