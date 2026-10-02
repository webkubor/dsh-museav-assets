# Changelog

## 0.1.2

- **修 0.1.1 装不上：`cordis.patch.yml` 的 `id` 缺引号。** 包名迁到 `@dsh-plugins`
  scope 时只给 `name` 加了引号、漏了 `id`，而 `@` 是 YAML 保留起始字符，于是整个
  patch 解析失败、dsh 拒绝安装：
  `Cannot validate installed package …: YAMLException: bad indentation of a mapping entry`。
  症状是指向配置文件，看着像配置写错，实为包名未引用。**0.1.1 请勿使用。**
- **补门禁**：`test/cordis-patch.test.mjs` 拦「未加引号的 `@scope` 值」+「id 必须等于包名」。
  刻意不引 js-yaml（本仓零依赖），改成对源文本做 YAML 标量合法性检查 —— 这类问题是
  YAML 规范层面的硬错误，不存在误报。已反向验证：把 bug 放回去，测试确实 fail。

## Unreleased

- **接入发版门禁** —— 与另外三个 dsh 插件同一套：`scripts/prepublish-gate.mjs` +
  `scripts/readme-gate.mjs` + `scripts/gate-lib.mjs`（gate-lib 是 prepublish-gate 的
  import 依赖，必须一起拷，否则 `ERR_MODULE_NOT_FOUND`），接在 `prepublishOnly` 末尾。
  真源在 `CortexOS/scripts/release-gate/`，改逻辑改真源，再用
  `check-release-gate-sync.mjs --fix` 同步 —— **别在本仓就地改**。
  为什么补：本仓此前是五个插件里唯一没接门禁的（`prepublishOnly` 只跑 `check && test`），
  四条产物契约和 README 首屏契约都不过。
- **README 首屏对齐 `open_source_project_baseline`** —— 居中品牌标题 + 4 个
  for-the-badge 徽章 + Why This 对比表 + 中英切换。此前是裸 `# 标题`，readme-gate 判不合规。

> 发版状态核实（2026-10-02）：scoped 名 `@dsh-plugins/dsh-museav-assets` 在 npm 上
> **仍不存在（404）**；无 scope 的 `dsh-museav-assets@0.1.0` 存在，且**尚未标 deprecated**。
> 即上面 0.1.1 写的「已 deprecated 指向本名」目前只是意图 —— 补发成功前，桌面端按
> scoped 名装不上。

## 0.1.1

- **包名迁到 `@dsh-plugins/dsh-museav-assets`**（与另外三个插件同一 scope）。
  无 scope 的 `dsh-museav-assets@0.1.0`（06:04 发出）**已于 09:29 撤回**（unpublish）——
  先发无 scope 再改 scope 是白折腾一轮，而且撤回的名字 24 小时后任何人都能抢。
  教训已写进 `../README.md` 的命名规则节。
  四处身份同步改：`package.json` / `export const name` / client 的 `ModuleLoader.id` /
  `cordis.patch.yml`；路由前缀 `/api/dsh-museav-assets` 保持不变（它与包名无关）。

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
