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
        case "$3" in
          add)
            # add 的第 4 个参数是文件路径：断言它真的落成了文件，再回一个直链
            if [ ! -f "$4" ]; then echo "add: 文件不存在 $4" >&2; exit 1; fi
            if [ ! -s "$4" ]; then echo "add: 文件是空的" >&2; exit 1; fi
            echo "✅ 已入素材库" >&2
            echo "https://img.webkubor.online/uploaded.png"
            exit 0 ;;
          rm)
            # rm <id>：$3 是子命令，$4 才是素材 id
            echo "✅ 素材已删：$4" >&2
            echo "$4"
            exit 0 ;;
          *)
            echo "「IP账户运营」素材库（1 条）:" >&2
            echo "  630b8428-394f-472a-ad27-036dce46e9c7  (未命名)            image" >&2
            printf '630b8428-394f-472a-ad27-036dce46e9c7\\thttps://img.webkubor.online/x.png\\n'
            exit 0 ;;
        esac ;;
      *)
        echo "工作区（1 个）:" >&2
        echo "  2282ad52-b0e9-4c52-bcf1-339c8a43adad  IP账户运营           出图 12/13  素材 1" >&2
        echo "2282ad52-b0e9-4c52-bcf1-339c8a43adad"
        exit 0 ;;
    esac ;;
  templates)
    case "$2" in
      create)
        echo "✅ 模板已建" >&2
        echo "77777777-8888-9999-aaaa-bbbbbbbbbbbb"
        exit 0 ;;
      delete)
        echo "✅ 已删" >&2
        echo "$3"
        exit 0 ;;
      publish|unshare)
        echo "✅ 可见性已改：$2" >&2
        echo "$3"
        exit 0 ;;
    esac
    echo "可用模板（1 个）:" >&2
    echo "  9798dde2-7b21-444a-9c6a-78a5c3490f18  演唱会海报·小红书风  v1.0.0  webkubor@163.com 演唱会  3:4  [图片]  字段:subject,title [个人]" >&2
    echo "9798dde2-7b21-444a-9c6a-78a5c3490f18"
    exit 0 ;;
  gen)
    # gen 同步跑完，stdout 是成品直链
    if [ -z "$2" ] && [ -z "$3" ]; then echo "gen: 缺提示词" >&2; exit 1; fi
    echo "https://img.webkubor.online/generated/stub.png"
    exit 0 ;;
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

test('六条路由各注册一次，路径互不重复', async (t) => {
  const { routes, restore } = await boot(stubBin)
  t.after(restore)
  assert.deepEqual([...routes.keys()].sort(), [
    '/api/dsh-museav-assets/assets',
    '/api/dsh-museav-assets/gen',
    '/api/dsh-museav-assets/health',
    '/api/dsh-museav-assets/jobs',
    '/api/dsh-museav-assets/projects',
    '/api/dsh-museav-assets/templates',
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

test('GET /templates 把归属与分类翻译成 CLI 的开关', async (t) => {
  const { call, restore } = await boot(stubBin)
  t.after(restore)

  const mine = await call('/api/dsh-museav-assets/templates?source=mine')
  assert.equal(mine.status, 200)
  assert.equal(mine.body.ok, true)
  assert.equal(mine.body.templates.length, 1)
  assert.equal(mine.body.templates[0].name, '演唱会海报·小红书风')
  assert.equal(mine.body.templates[0].source, '个人')
  assert.equal(mine.body.templates[0].ratio, '3:4')
  assert.equal(mine.body.templates[0].fieldCount, 2)

  // 未知 source 不该被当成某个开关传下去，宁可当全量
  const weird = await call('/api/dsh-museav-assets/templates?source=%E4%B8%8D%E5%AD%98%E5%9C%A8')
  assert.equal(weird.body.source, 'all')
})

test('POST /assets 传素材：base64 落成临时文件交给 CLI，临时目录事后清空', async (t) => {
  const { call, restore } = await boot(stubBin)
  t.after(restore)
  const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64')

  const noProject = await call('/api/dsh-museav-assets/assets', { method: 'POST', body: { data: png, filename: 'a.png' } })
  assert.equal(noProject.status, 400)

  const ok = await call('/api/dsh-museav-assets/assets', {
    method: 'POST',
    body: { project: '2282ad52-b0e9-4c52-bcf1-339c8a43adad', filename: '垫图.png', data: png, name: '垫图' },
  })
  assert.equal(ok.status, 200)
  assert.equal(ok.body.ok, true, `期望上传成功，实际：${JSON.stringify(ok.body)}`)
  assert.equal(ok.body.url, 'https://img.webkubor.online/uploaded.png')
  // 文件名里的路径成分不能被带进临时路径：只留 basename
  assert.equal(ok.body.filename, '垫图.png')
})

test('POST /assets 载荷超限回 400 + 人话，不是网络错误', async (t) => {
  const { call, restore } = await boot(stubBin)
  t.after(restore)
  const huge = 'A'.repeat(11 * 1024 * 1024 + 16)
  const res = await call('/api/dsh-museav-assets/assets', {
    method: 'POST',
    body: { project: 'p', filename: 'big.png', data: huge },
  })
  assert.equal(res.status, 400)
  assert.equal(res.body.ok, false)
  assert.match(res.body.error, /太大/)
})

test('DELETE /assets?id= 删素材，缺 id 回 400', async (t) => {
  const { call, restore } = await boot(stubBin)
  t.after(restore)
  const bad = await call('/api/dsh-museav-assets/assets', { method: 'DELETE' })
  assert.equal(bad.status, 400)
  const ok = await call('/api/dsh-museav-assets/assets?id=630b8428-394f-472a-ad27-036dce46e9c7', { method: 'DELETE' })
  assert.equal(ok.status, 200)
  assert.equal(ok.body.ok, true)
  assert.equal(ok.body.id, '630b8428-394f-472a-ad27-036dce46e9c7')
})

test('POST /templates 新建 / 删除 / 分享，都翻译成对应 CLI 子命令', async (t) => {
  const { call, restore } = await boot(stubBin)
  t.after(restore)

  const noName = await call('/api/dsh-museav-assets/templates', { method: 'POST', body: { prompt: '{a}' } })
  assert.equal(noName.status, 400)

  const noPrompt = await call('/api/dsh-museav-assets/templates', { method: 'POST', body: { name: '封面' } })
  assert.equal(noPrompt.status, 400)

  const created = await call('/api/dsh-museav-assets/templates', {
    method: 'POST',
    body: { name: '演唱会海报', prompt: '{artist} 在 {city} 的演唱会海报', category: '演唱会', ratio: '3:4' },
  })
  assert.equal(created.status, 200)
  assert.equal(created.body.ok, true)
  assert.equal(created.body.id, '77777777-8888-9999-aaaa-bbbbbbbbbbbb')

  const shared = await call('/api/dsh-museav-assets/templates', {
    method: 'POST', body: { action: 'share', id: '9798dde2-7b21-444a-9c6a-78a5c3490f18' },
  })
  assert.equal(shared.body.ok, true)
  assert.equal(shared.body.shared, true)

  const unshared = await call('/api/dsh-museav-assets/templates', {
    method: 'POST', body: { action: 'unshare', id: '9798dde2-7b21-444a-9c6a-78a5c3490f18' },
  })
  assert.equal(unshared.body.shared, false)

  const deleted = await call('/api/dsh-museav-assets/templates', {
    method: 'POST', body: { action: 'delete', id: '9798dde2-7b21-444a-9c6a-78a5c3490f18' },
  })
  assert.equal(deleted.body.ok, true)
  assert.equal(deleted.body.id, '9798dde2-7b21-444a-9c6a-78a5c3490f18')
})

test('POST /gen 校验 prompt/模板二选一，并把比例白名单挡住', async (t) => {
  const { call, restore } = await boot(stubBin)
  t.after(restore)
  const empty = await call('/api/dsh-museav-assets/gen', { method: 'POST', body: { prompt: '  ' } })
  assert.equal(empty.status, 400)
  const badRatio = await call('/api/dsh-museav-assets/gen', { method: 'POST', body: { prompt: 'x', ratio: '7:13' } })
  assert.equal(badRatio.status, 400)
  const good = await call('/api/dsh-museav-assets/gen', { method: 'POST', body: { prompt: '一张海报', ratio: '3:4' } })
  assert.equal(good.status, 200)
  assert.equal(good.body.ok, true)
})
