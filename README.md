# dsh-museav-assets

在 DSH 主区加一个「资产」tab：**按项目（工作区）看 MUSE AV 的素材库和最近出图**。
点素材即复制直链，可以直接当垫图（`museav gen --ref <url>`）用。

基于本机的 **museav CLI**，不重复造出图能力 —— 出图/上传继续走已经接进 DSH 的
`mcp__museav__*` 工具（见 profile 的 cordis.patch.yml）。这个插件只补一件事：
**在 DSH 里看得见「我有哪些项目、每个项目里有什么素材」**。

## 放在哪个 tab

主区顶栏，`conversation.view` 的第 6 个 tab，**order 40**，排在
对话(0) / 轨迹(10) / 记忆(20) / 上下文 / 电脑环境(30) 之后。

```js
ctx.slots.register({
  name: 'conversation.view',
  id: 'museav-assets',
  order: 40,
  label: () => t('title'),   // 「资产」
}, AssetsView)
```

为什么是主区而不是右侧面板：资产是「一屏看完的事」（项目列表 + 缩略图网格 + 出图流水），
右侧面板是给单份文档/单个预览的窄栏，塞不下网格；而且右侧面板的 tab 语义是
「当前选中对象」，资产是全局的，不属于任何一个会话。主区 tab 已有先例
（dsh-user-mirror 的「记忆」同样是全局内容挂在会话壳里）。

## 装

> **已发布**：`dsh-museav-assets@0.1.1`（npm）。桌面端在**应用内的插件管理**里装 —— 它从 npm 拉。
> 命令行装不进 `desktop` profile（`profile "desktop" is managed exclusively by the Electron application`）。

自建 profile（CLI 能管的，例如本地开发用的 `desktop-local`）：

```sh
npm run deploy   # rsync 进 ~/.dsh/profiles/desktop-local/node_modules/dsh-museav-assets/
```

再把包名加进该 profile（`~/.dsh/profiles/desktop-local/package.json`）：

```jsonc
"dependencies": { "dsh-museav-assets": "^0.1.0" },
"dsh": { "profile": { "bundles": [ /* … */, "dsh-museav-assets" ] } }
```

拓扑级变更要重启：桌面端是**退出并重开 app**（`~/.dsh/restart.sh` 已作废，现在探测不到 3080 服务会直接以 1 退出）。

前置条件只有一条：本机 `museav` CLI 已登录（`museav login`）。
插件自己**不读也不转发** `~/.museav.json` 里的 token。

## 接口

| 路由 | 做什么 |
|---|---|
| `GET /api/dsh-museav-assets/health` | CLI 在不在、什么版本、工作区上限 |
| `GET /api/dsh-museav-assets/projects` | 工作区列表 + 出图/素材计数 + `used/limit/full` |
| `POST /api/dsh-museav-assets/projects` | `{name}` 新建工作区（≤20 字） |
| `GET /api/dsh-museav-assets/assets?project=<id\|名>` | 该工作区的素材库 |
| `GET /api/dsh-museav-assets/jobs?limit=<n>` | 最近出图记录 |

失败语义：**上游/CLI 出错一律 200 + `{ok:false,error}`**，tab 内联显示原因；
只有参数不合法才 400。一次网络抖动不该让 tab 变白屏。

## CLI 契约（插件唯一依赖的东西）

`lib/museav.js` 是**唯一**知道 CLI 输出长什么样的文件。museav-cli 的
stdout/stderr 分工就是它的脚本契约：

| 命令 | stdout（真值） | stderr（人看的补充） |
|---|---|---|
| `museav projects` | id 换行 | 名称 / 出图 x/y / 素材 n / brand |
| `museav projects assets --project X` | `id<TAB>url` | 名称 / media_type / tags |
| `museav jobs` | **完整 JSON 数组** | 表格式摘要 |
| `museav projects create --name N` | 新建 id | 成功提示 |

所以：**真值一律取 stdout，stderr 只用来补展示字段**。stderr 解析不出来就降级
（项目名退回 id 前 8 位，素材名退回「未命名」），绝不因为上游改一句中文就让整页空白。
`test/museav-parse.test.mjs` 用真机抓的输出当夹具守着这条线。

> 已知脆点：`museav projects` / `projects assets` **没有 `--json`**，展示字段只能从
> stderr 表格里解析。给 museav-cli 这两个命令加 `--json` 就能把这条脆点彻底消掉 ——
> 真源在 `~/dev/muse/museav-cli/src/commands/projects.ts`，改的是上游仓，不是本插件。

## 不做什么

- 不出图、不传文件 —— 那是 CLI / MCP 的活，重复实现只会两处漂移
- 不缓存 —— 数据便宜，状态随时在变；想要缓存再加
- 不轮询 —— 挂载时拉一次，用户点「刷新」才重跑

## 测试

```sh
npm run check && npm test   # 28 个：解析契约 12 + 路由 8 + UI 8
```

路由测试用 stub 可执行文件顶替 CLI（走 `MUSEAW_BIN` 环境变量），**全程不联网、不碰真账号**。

CLI 路径为什么是环境变量而不是插件配置：这套 Cordis 的函数式插件读不到 `ctx.config`
（声明了会永远 `pending (waiting for service: config)`）。`MUSEAW_BIN` 也正好和 profile
里 MCP 桥的约定一致。改它不用重载插件 —— 每次请求现取。
