/**
 * 路由契约测试 —— 用 stub 可执行文件顶替 museav CLI，全程不联网、不碰真账号。
 *
 * 守三件事：
 *   1. 路由只注册一次、路径互不相同（SOP 红线：重复 exact 路由会让整棵 Cordis 崩）
 *   2. 上游失败一律 200 + {ok:false,error}，只有参数不合法才 400
 *   3. cliBin 真的被用上了（测试能注入 stub = 运行时能换 CLI 路径）
 *
 * 另外加了一条机械检查：代码里用到的每个 ctx.* 都必须在 inject 列表里。
 * 这不是洁癖 —— 漏声明不会让任何本地测试红，只会在真机上让插件静默变哑
 * （2026-09-29 首次部署：`cannot get property "config" without inject`）。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter } from 'node:events'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const STUB = `#!/bin/sh
# stub museav：按参数回放真机输出形状
if [ "$MUSEAV_STUB_FAIL" = "1" ]; then
  echo "Error: 还没登录，先跑 museav login" >&2
  exit 1
fi
case "$1" in
  --version) echo "3.9.1"; exit 0 ;;
  projects)
    case "$2" in
      create)
        echo "new-workspace-id-0000" >&2
        echo "11111111-2222-3333-4444-555555555555"
        exit 0 ;;
      assets)
        echo "「IP账户运营」素材库（1 条）:" >&2
        echo "  630b8428-394f-472a-ad27-036dce46e9c7  (未命名)            image" >&2
        printf '630b8428-394f-472a-ad27-036dce46e9c7\\thttps://img.webkubor.online/x.png\\n'
        exit 0 ;;
      *)
        echo "工作区（1 个）:" >&2
        echo "  2282ad52-b0e9-4c52-bcf1-339c8a43adad  IP账户运营           出图 12/13  素材 1" >&2
        echo "2282ad52-b0e9-4c52-bcf1-339c8a43adad"
        exit 0 ;;
    esac ;;
  jobs)
    echo '[{"id":"c2ee0e1d-7a54-439a-9feb-49296b023c47","status":"done","media_type":"image","model":"ChatGPT Image2.5","cdn_url":"https://img.webkubor.online/x.png","prompt":"小红书封面","ratio":"3:4","created_at":"2026-09-29T09:47:57.583131+00:00","workspace_id":null,"elapsed_ms":39494,"error":null}]'
    exit 0 ;;
  *) exit 1 ;;
esac
`

/** 造一个可执行的 stub，返回它的绝对路径。 */
function makeStub () {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-museav-stub-'))
  const file = join(dir, 'museav')
  writeFileSync(file, STUB)
  chmodSync(file, 0o755)
  return file
}

/**
 * 起一个假 host：抓下注册的路由，返回 { routes, call, restore }。
 *
 * CLI 路径走 `MUSEAW_BIN` 环境变量而不是插件配置 —— 这套 Cordis 的函数式插件
 * 读不到 ctx.config（见 lib/index.js 的说明），环境变量是唯一能换掉 CLI 的口子，
 * 也正好和 profile 里 MCP 桥的 MUSEAV_BIN 约定一致。
 */
async function boot (bin) {
  const { apply } = await import('../lib/index.js')
  const routes = new Map()
  const previous = process.env.MUSEAW_BIN
  if (bin !== undefined) process.env.MUSEAW_BIN = bin
  const restore = () => {
    if (previous === undefined) delete process.env.MUSEAW_BIN
    else process.env.MUSEAW_BIN = previous
  }
  apply({
    effect: (fn) => fn(),
    webServer: {
      register: (route) => { routes.set(route.path, route.handler) },
    },
  })

  const call = (path, { method = 'GET', headers = {}, url = path, body = null } = {}) => {
    const request = new EventEmitter()
    request.method = method
    request.headers = headers
    request.url = url
    return new Promise((resolve) => {
      const response = {
        statusCode: null,
        headers: null,
        writeHead (status, headers) { this.statusCode = status; this.headers = headers },
        end (payload) {
          resolve({
            status: this.statusCode,
            body: payload ? JSON.parse(payload) : null,
          })
        },
      }
      // handler 跑到第一个 await 之前都是同步的，body 监听就是在那一刻挂上的 ——
      // 所以这里必须**同步**推 body，等 handler 的 promise 回来再推就是死锁。
      // 路由是 exact 注册，查询串不进 key。
      routes.get(path.split('?')[0])(request, response)
      if (body !== null) request.emit('data', JSON.stringify(body))
      request.emit('end')
    })
  }

  return { routes, call, restore }
}

const stubBin = makeStub()

test('inject 覆盖代码里用到的每个 ctx.* —— 漏声明只会让插件在真机上静默变哑', async () => {
  const { inject } = await import('../lib/index.js')
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../lib/index.js'),
    'utf8',
  )
  // 先去注释：lib/index.js 里「不要读 ctx.config」这句警告自己就带 ctx.config，
  // 不去注释就会把注释当代码，误报。URL 里的 // 会被当成行注释截断后半行 ——
  // 代价只是少扫半行，不会漏报真实的 ctx 用法。
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  // ctx.effect 是 Cordis fiber 自带的方法，不是注入的服务，不需要声明。
  const CORE = new Set(['effect'])
  const used = new Set()
  for (const m of code.matchAll(/\bctx\.([A-Za-z_][A-Za-z0-9_]*)/g)) used.add(m[1])
  assert.ok(used.size > 0, '没扫到 ctx.* 用法，检查是不是正则失效了')
  for (const key of used) {
    if (CORE.has(key)) continue
    assert.ok(
      inject.includes(key),
      `代码用了 ctx.${key}，但 inject 里没有 '${key}' —— Cordis 要么抛 cannot get property "${key}" without inject，要么永远 pending (waiting for service: ${key})`,
    )
  }
  // 反向：这套 Cordis 里 'config' 不是可注入服务，声明了只会永远等不到。
  assert.ok(!inject.includes('config'), "inject 里不该有 'config'：函数式插件读不到它，声明了只会 pending")
})

test('四条路由各注册一次，路径互不重复', async (t) => {
  const { routes, restore } = await boot(stubBin)
  t.after(restore)
  assert.deepEqual([...routes.keys()].sort(), [
    '/api/dsh-museav-assets/assets',
    '/api/dsh-museav-assets/health',
    '/api/dsh-museav-assets/jobs',
    '/api/dsh-museav-assets/projects',
  ])
})

test('GET /projects 返回合并后的项目与 5 个上限', async (t) => {
  const { call, restore } = await boot(stubBin)
  t.after(restore)
  const res = await call('/api/dsh-museav-assets/projects')
  assert.equal(res.status, 200)
  assert.equal(res.body.ok, true)
  assert.equal(res.body.projects.length, 1)
  assert.equal(res.body.projects[0].name, 'IP账户运营')
  assert.equal(res.body.used, 1)
  assert.equal(res.body.limit, 5)
  assert.equal(res.body.full, false)
})

test('GET /assets 缺 project 时 400，其余情况 200', async (t) => {
  const { call, restore } = await boot(stubBin)
  t.after(restore)
  const bad = await call('/api/dsh-museav-assets/assets')
  assert.equal(bad.status, 400)
  assert.equal(bad.body.ok, false)

  const good = await call('/api/dsh-museav-assets/assets?project=IP%E8%B4%A6%E6%88%B7%E8%BF%90%E8%90%A5')
  assert.equal(good.status, 200)
  assert.equal(good.body.assets.length, 1)
  assert.equal(good.body.assets[0].url, 'https://img.webkubor.online/x.png')
  assert.equal(good.body.assets[0].mediaType, 'image')
})

test('GET /jobs 把 stdout 的 JSON 裁剪成 tab 要的字段', async (t) => {
  const { call, restore } = await boot(stubBin)
  t.after(restore)
  const res = await call('/api/dsh-museav-assets/jobs?limit=5')
  assert.equal(res.status, 200)
  assert.equal(res.body.jobs.length, 1)
  assert.equal(res.body.jobs[0].model, 'ChatGPT Image2.5')
  assert.equal(res.body.jobs[0].steps, undefined)
})

test('POST /projects 校验名字并透传新 id', async (t) => {
  const { call, restore } = await boot(stubBin)
  t.after(restore)
  const empty = await call('/api/dsh-museav-assets/projects', { method: 'POST', body: { name: '   ' } })
  assert.equal(empty.status, 400)

  const long = await call('/api/dsh-museav-assets/projects', {
    method: 'POST',
    body: { name: 'x'.repeat(21) },
  })
  assert.equal(long.status, 400)

  const ok = await call('/api/dsh-museav-assets/projects', { method: 'POST', body: { name: '新项目' } })
  assert.equal(ok.status, 200)
  assert.equal(ok.body.ok, true)
  assert.equal(ok.body.id, '11111111-2222-3333-4444-555555555555')
})

test('跨源请求被拒', async (t) => {
  const { call, restore } = await boot(stubBin)
  t.after(restore)
  const res = await call('/api/dsh-museav-assets/projects', {
    headers: { 'sec-fetch-site': 'cross-site' },
  })
  assert.equal(res.status, 403)
  assert.equal(res.body.ok, false)
})

test('CLI 出错时回 200 + {ok:false,error}，让 tab 内联显示而不是白屏', async (t) => {
  process.env.MUSEAV_STUB_FAIL = '1'
  const { call, restore } = await boot(stubBin)
  t.after(() => { delete process.env.MUSEAV_STUB_FAIL; restore() })
  const res = await call('/api/dsh-museav-assets/projects')
  assert.equal(res.status, 200)
  assert.equal(res.body.ok, false)
  assert.match(res.body.error, /museav login/)
  assert.deepEqual(res.body.projects, [])
})

test('CLI 不存在时也不抛 —— health 如实说没找到', async (t) => {
  const { call, restore } = await boot('/nonexistent/museav-does-not-exist')
  t.after(restore)
  const res = await call('/api/dsh-museav-assets/health')
  assert.equal(res.status, 200)
  assert.equal(res.body.ok, false)
  assert.equal(res.body.cli.version, null)
  assert.equal(res.body.projectLimit, 5)
})
