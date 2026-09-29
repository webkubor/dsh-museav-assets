/**
 * dsh-museav-assets —— Host（Node）半。
 *
 * 职责只有一件事：把 museav CLI 的输出变成 client 半能直接渲染的 JSON。
 * 自己不碰 ~/.museav.json，不转发 token —— 认证是 CLI 的事（见 lib/museav.js）。
 *
 * 路由（全部 exact，一次注册，路径唯一 —— 重复注册会整棵 Cordis 崩）：
 *   GET    /api/dsh-museav-assets/health                        CLI 在不在、什么版本
 *   GET    /api/dsh-museav-assets/projects                      工作区列表 + 出图/素材计数
 *   POST   /api/dsh-museav-assets/projects                      { name } 新建工作区
 *   GET    /api/dsh-museav-assets/assets?project=<id|名>        工作区素材库
 *   POST   /api/dsh-museav-assets/assets                        传素材（base64 → 临时文件 → CLI）
 *   DELETE /api/dsh-museav-assets/assets?id=<素材id>            删素材（CLI 是硬删）
 *   GET    /api/dsh-museav-assets/templates?source=&category=   我的 / 租户 / 平台模板
 *   GET    /api/dsh-museav-assets/jobs?limit=<n>                最近出图记录
 *
 * 失败语义：上游/CLI 出错一律 200 + `{ok:false,error}`，让 tab 内联显示原因；
 * 只有「参数不合法」才回 400。tab 不因为一次网络抖动变成白屏。
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import {
  runMuseav,
  mergeProjects,
  mergeAssets,
  mergeTemplates,
  parseJobArray,
  summarizeJobs,
  PROJECT_LIMIT,
} from './museav.js'

export const name = 'dsh-museav-assets'

/**
 * 只需要 HTTP 载体。
 *
 * **不要**在这里声明 'config'，也不要读 `ctx.config`（2026-09-29 实测连踩两次）：
 *   · 不声明就读 → `cannot get property "config" without inject`
 *   · 声明了也等不到 → `pending (waiting for service: config)`，插件永远 pending
 * 这套 Cordis 里 config 是 entry 上的 `Config` 描述符，由 class Service 形态的插件
 * 自己持有（见 dsh-agent-default-model）；函数式插件没有这条路。
 * 所以要换 CLI 路径就走环境变量 `MUSEAW_BIN` —— 与 profile 里 MCP 桥的约定一致。
 *
 * 这类错**不会**把服务带崩，只会让插件静默变哑：日志一行、页面照常、路由 404。
 * 所以「改完 host 半去 launchd.log 搜自己插件名」不是形式主义。
 */
export const inject = ['webServer']

/** museav 可执行文件名或绝对路径。运行时求值，测试就是靠它换成 stub。 */
function cliBin () {
  return process.env.MUSEAW_BIN || 'museav'
}

/** 单条 CLI 命令的超时（毫秒）。出图类慢，列表类快，这里给列表用的宽松值。 */
const CLI_TIMEOUT_MS = 30000

/** 出图记录单次最多取几条（服务端固定只返回最近 50 条）。 */
const MAX_JOBS = 50

/** 宽高比白名单 —— 直接透传给 CLI，所以先在这儿挡一道，别把任意字符串塞进命令行。 */
const RATIOS = ['3:4', '9:16', '1:1', '4:3', '16:9']

/** 出图是同步跑完的（CLI 自己轮询到终态），实测 20~60s，超时给到 5 分钟。 */
const GEN_TIMEOUT_MS = 300000

/** 垫图下载上限：单张 8MB、总计 20MB，超了就不带这张 ref（不是致命错）。 */
const REF_MAX_BYTES = 8 * 1024 * 1024
const REF_TOTAL_MAX_BYTES = 20 * 1024 * 1024

/**
 * 传素材的载荷上限（base64 字符数）。
 * base64 比原文大 ~33%，CLI 侧图片上限 8MB → 这里给 11MB 的字符预算。
 * 更大的文件（视频/音频）不走这条路，让用户回 CLI 跑 `museav upload`。
 */
const MAX_UPLOAD_CHARS = 11 * 1024 * 1024

/** 路由前缀 —— 结尾不带斜杠（webServer 的 prefix 匹配规则）。 */
const PREFIX = '/api/dsh-museav-assets'

/** 同源校验：浏览器页面自身发起的请求才放行，避免被第三方页面读走素材清单。 */
function isSameOrigin (request) {
  const site = request.headers['sec-fetch-site']
  if (typeof site === 'string') return site === 'same-origin' || site === 'none'
  return true
}

function sendJson (response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

/**
 * 读 JSON 请求体。
 *
 * limit 是**字符**数上限：普通接口 4KB（入参只有一个项目名），传素材接口要放到
 * MAX_UPLOAD_CHARS。超限不是 destroy 掉请求了事 —— 那会让浏览器看到网络错误而不是
 * 一句人话，这里直接 resolve 一个 { tooLarge: true }，由路由回 400 + 原因。
 */
function readJsonBody (request, limit = 4096) {
  return new Promise((resolve) => {
    let raw = ''
    let overflow = false
    request.on('data', (chunk) => {
      if (overflow) return
      raw += chunk
      if (raw.length > limit) { overflow = true; raw = '' }
    })
    request.on('end', () => {
      if (overflow) return resolve({ tooLarge: true })
      if (!raw.trim()) return resolve({})
      try {
        const parsed = JSON.parse(raw)
        resolve(parsed && typeof parsed === 'object' ? parsed : {})
      } catch {
        resolve({})
      }
    })
    request.on('error', () => resolve({}))
  })
}

/**
 * 把一张 CDN 直链下载成临时文件，交给 `museav gen --ref`。
 *
 * 为什么必须下载：CLI 的 --ref 收文件路径，素材库和历史作品给的全是直链。
 * 尺寸从 URL 尾缀猜，猜不出就不给后缀 —— CLI 按字节内容判类型，后缀只是线索。
 *
 * @param {{spent: number}} budget 多张垫图共用的字节预算，超了就别再下了
 * @returns {Promise<string|null>} 落盘路径；下不来返回 null（调用方跳过这张 ref）
 */
async function downloadRef (href, dir, index, budget) {
  try {
    const res = await fetch(href, { signal: AbortSignal.timeout(20000) })
    if (!res.ok) return null
    const len = Number(res.headers.get('content-length') ?? 0)
    if (len > REF_MAX_BYTES || budget.spent + len > REF_TOTAL_MAX_BYTES) return null
    const bytes = Buffer.from(await res.arrayBuffer())
    if (!bytes.length || bytes.length > REF_MAX_BYTES) return null
    budget.spent += bytes.length
    if (budget.spent > REF_TOTAL_MAX_BYTES) return null
    const name = basename(new URL(href).pathname) || `ref-${index}`
    const safe = name.replace(/[^\w.-]/g, '_').slice(-40)
    const target = join(dir, `ref-${index}-${safe}`)
    await writeFile(target, bytes)
    return target
  } catch {
    return null
  }
}

/**
 * 把浏览器传来的 base64 落成临时文件，交给 `museav projects assets add`，然后清掉。
 *
 * 为什么不直接把 base64 喂 CLI：CLI 的 add 收的是**文件路径**。
 * 为什么不复用 DSH 的文件上传凭据（dsh-client-file-upload）：那套 receipt 属于会话
 * 工作区的文件区，素材要进的是 museav 的对象存储，走一遍是两次归属，写临时文件更直白。
 *
 * 文件名只取 basename + 扩展名：客户端传来的名字是用户可控的，拼路径等于把
 * ../../.ssh 之类的东西交给文件系统。扩展名保留 —— CLI 按字节内容判类型，但后缀
 * 仍是它的兜底线索。
 *
 * @returns {Promise<{ok: boolean, error?: string, url?: string, filename?: string}>}
 */
async function stageAndUpload ({ project, filename, data, name, tag }, cliOpts) {
  const ext = extname(filename).slice(0, 12).replace(/[^.\w]/g, '')
  const dir = await mkdtemp(join(tmpdir(), 'dsh-museav-upload-'))
  const target = join(dir, `upload${ext || '.bin'}`)
  try {
    const bytes = Buffer.from(data, 'base64')
    if (!bytes.length) return { ok: false, error: '文件内容解不开（base64 损坏）' }
    await writeFile(target, bytes)

    const args = ['projects', 'assets', 'add', target, '--project', project]
    if (name) args.push('--name', String(name).slice(0, 60))
    if (tag) args.push('--tag', String(tag).slice(0, 30))
    const res = await runMuseav(args, { ...cliOpts, timeoutMs: 120000 })
    if (!res.ok) return { ok: false, error: res.error }
    // CLI 的 stdout 是新素材的 cdn_url
    const url = res.stdout.trim()
    return { ok: true, url: url || null, filename: basename(filename) }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  } finally {
    // 临时文件必须清 —— 里面有用户的原图
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/** GET 路由共用的入口检查：方法、同源。 */
function guard (request, response, allow) {
  if (!allow.includes(request.method)) {
    response.writeHead(405, { allow: allow.join(', ') })
    response.end()
    return false
  }
  if (!isSameOrigin(request)) {
    sendJson(response, 403, { ok: false, error: '拒绝跨源读取' })
    return false
  }
  return true
}

/** 从 URL 上取查询参数。 */
function queryOf (request) {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  return url.searchParams
}

export function apply (ctx) {
  // 每次请求现取：测试和临时换 CLI 路径都不用重载插件。
  const cliOpts = () => ({ bin: cliBin(), timeoutMs: CLI_TIMEOUT_MS })

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${PREFIX}/health`,
    handler: async (request, response) => {
      if (!guard(request, response, ['GET', 'HEAD'])) return
      const res = await runMuseav(['--version'], cliOpts())
      sendJson(response, 200, {
        ok: res.ok,
        cli: {
          bin: cliBin(),
          version: res.ok ? res.stdout.trim() : null,
          error: res.error,
        },
        projectLimit: PROJECT_LIMIT,
      })
    },
  }), 'dsh-museav-assets: health route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${PREFIX}/projects`,
    handler: async (request, response) => {
      if (!guard(request, response, ['GET', 'HEAD', 'POST'])) return

      // 新建工作区：先判参数，参数不合法才回 400。
      if (request.method === 'POST') {
        const body = await readJsonBody(request)
        const name = String(body.name ?? '').trim()
        if (!name) {
          sendJson(response, 400, { ok: false, error: '缺少项目名' })
          return
        }
        if (name.length > 20) {
          sendJson(response, 400, { ok: false, error: '项目名最多 20 字' })
          return
        }
        const res = await runMuseav(['projects', 'create', '--name', name], cliOpts())
        if (!res.ok) {
          sendJson(response, 200, { ok: false, error: res.error })
          return
        }
        sendJson(response, 200, { ok: true, id: res.stdout.trim() || null })
        return
      }

      const res = await runMuseav(['projects'], cliOpts())
      if (!res.ok) {
        sendJson(response, 200, { ok: false, error: res.error, projects: [] })
        return
      }
      const projects = mergeProjects(res.stdout, res.stderr)
      sendJson(response, 200, {
        ok: true,
        projects,
        used: projects.length,
        limit: PROJECT_LIMIT,
        // 到顶了就别再让用户点「新建」——服务端会拒，白跑一趟。
        full: projects.length >= PROJECT_LIMIT,
      })
    },
  }), 'dsh-museav-assets: projects route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${PREFIX}/assets`,
    handler: async (request, response) => {
      if (!guard(request, response, ['GET', 'HEAD', 'POST', 'DELETE'])) return

      // ── 传素材：浏览器给 base64，host 落临时文件再交给 CLI ──
      if (request.method === 'POST') {
        const body = await readJsonBody(request, MAX_UPLOAD_CHARS)
        if (body.tooLarge) {
          sendJson(response, 400, {
            ok: false,
            error: `文件太大：载荷超过 ${(MAX_UPLOAD_CHARS / 1024 / 1024).toFixed(0)}MB。大视频请回终端跑 museav upload。`,
          })
          return
        }
        const project = String(body.project ?? '').trim()
        const filename = String(body.filename ?? '').trim()
        const data = String(body.data ?? '')
        if (!project) { sendJson(response, 400, { ok: false, error: '缺少 project' }); return }
        if (!filename) { sendJson(response, 400, { ok: false, error: '缺少文件名' }); return }
        if (!data) { sendJson(response, 400, { ok: false, error: '没有文件内容' }); return }
        // base64 比原文大 33%；CLI 侧图片上限 8MB，这里按 11MB 的载荷卡。
        if (data.length > MAX_UPLOAD_CHARS) {
          sendJson(response, 400, {
            ok: false,
            error: `文件太大（载荷 ${(data.length / 1024 / 1024).toFixed(1)}MB，上限 ${(MAX_UPLOAD_CHARS / 1024 / 1024).toFixed(0)}MB）。大视频请用 museav upload 走 CLI。`,
          })
          return
        }
        const uploaded = await stageAndUpload({ project, filename, data, name: body.name, tag: body.tag }, cliOpts())
        sendJson(response, 200, uploaded)
        return
      }

      // ── 删素材：CLI 是硬删（R2 对象 + 记录一起没）──
      if (request.method === 'DELETE') {
        const id = queryOf(request).get('id')?.trim()
        if (!id) { sendJson(response, 400, { ok: false, error: '缺少素材 id' }); return }
        const res = await runMuseav(['projects', 'assets', 'rm', id], cliOpts())
        if (!res.ok) { sendJson(response, 200, { ok: false, error: res.error }); return }
        sendJson(response, 200, { ok: true, id: res.stdout.trim() || id })
        return
      }

      const project = queryOf(request).get('project')?.trim()
      if (!project) {
        sendJson(response, 400, { ok: false, error: '缺少 project（工作区 id 或名称）' })
        return
      }
      const res = await runMuseav(['projects', 'assets', '--project', project], cliOpts())
      if (!res.ok) {
        sendJson(response, 200, { ok: false, error: res.error, assets: [] })
        return
      }
      sendJson(response, 200, { ok: true, project, assets: mergeAssets(res.stdout, res.stderr) })
    },
  }), 'dsh-museav-assets: assets route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${PREFIX}/gen`,
    handler: async (request, response) => {
      if (!guard(request, response, ['POST'])) return
      const body = await readJsonBody(request)
      const prompt = String(body.prompt ?? '').trim()
      const templateId = String(body.templateId ?? '').trim()
      const ratio = String(body.ratio ?? '').trim()
      const project = String(body.project ?? '').trim()
      const fields = body.fields && typeof body.fields === 'object' ? body.fields : null
      const refs = Array.isArray(body.refs) ? body.refs.slice(0, 5) : []

      // CLI 的三选一：prompt / skill / template。这里只做 prompt 与 template 两种 ——
      // skill 走服务端展开，tab 里给一个技能下拉不如让聊天里用 mcp__museav__gen_background。
      if (!prompt && !templateId) {
        sendJson(response, 400, { ok: false, error: '给一句提示词，或者选一个模板' })
        return
      }
      if (ratio && !RATIOS.includes(ratio)) {
        sendJson(response, 400, { ok: false, error: `比例只能是 ${RATIOS.join(' / ')}` })
        return
      }

      const dir = await mkdtemp(join(tmpdir(), 'dsh-museav-gen-'))
      try {
        const args = ['gen']
        if (templateId) {
          args.push('--template', templateId)
          if (fields && Object.keys(fields).length) args.push('--fields', JSON.stringify(fields))
        } else {
          args.push('--prompt', prompt)
        }
        if (ratio) args.push('--ratio', ratio)
        if (project) args.push('--project', project)
        if (body.transparent === true) args.push('--transparent')

        // --ref 收的是**文件路径**，而素材库给的是 CDN 直链 —— 这里下载一份到临时目录。
        // 顺序即语义：提示词里的「图片1/图片2」对应 refs 的下标，所以必须按原序追加。
        const budget = { spent: 0 }
        for (const [i, url] of refs.entries()) {
          const href = String(url ?? '').trim()
          if (!href || !/^https?:\/\//i.test(href)) continue
          const local = await downloadRef(href, dir, i, budget)
          if (local) args.push('--ref', local)
        }

        // gen 同步跑完（CLI 自己轮询到终态），实测 20~60s，所以超时给到 5 分钟
        const res = await runMuseav(args, { ...cliOpts(), timeoutMs: GEN_TIMEOUT_MS })
        if (!res.ok) {
          sendJson(response, 200, { ok: false, error: res.error })
          return
        }
        // CLI stdout 是成品直链，一行一条（批量时多行）
        const urls = res.stdout.split('\n').map((u) => u.trim()).filter(Boolean)
        sendJson(response, 200, { ok: true, urls, url: urls[0] ?? null })
      } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => {})
      }
    },
  }), 'dsh-museav-assets: gen route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${PREFIX}/templates`,
    handler: async (request, response) => {
      if (!guard(request, response, ['GET', 'HEAD', 'POST', 'DELETE'])) return

      // ── 新建模板：只有 名字 + 提示词模板是必填，其余走 CLI 默认 ──
      if (request.method === 'POST') {
        const body = await readJsonBody(request)
        const action = String(body.action ?? '').trim()
        const id = String(body.id ?? '').trim()

        if (action === 'share' || action === 'unshare') {
          if (!id) { sendJson(response, 400, { ok: false, error: '缺少模板 id' }); return }
          // publish / unshare：unshare 是收紧方向，服务端不校验门槛
          const res = await runMuseav(['templates', action, id], cliOpts())
          if (!res.ok) { sendJson(response, 200, { ok: false, error: res.error }); return }
          sendJson(response, 200, { ok: true, id, shared: action === 'share' })
          return
        }

        if (action === 'delete') {
          if (!id) { sendJson(response, 400, { ok: false, error: '缺少模板 id' }); return }
          const res = await runMuseav(['templates', 'delete', id], cliOpts())
          if (!res.ok) { sendJson(response, 200, { ok: false, error: res.error }); return }
          sendJson(response, 200, { ok: true, id })
          return
        }

        const name = String(body.name ?? '').trim()
        const prompt = String(body.prompt ?? '').trim()
        if (!name) { sendJson(response, 400, { ok: false, error: '给模板起个名字' }); return }
        if (!prompt) { sendJson(response, 400, { ok: false, error: '提示词模板不能为空（占位符用 {key} 形式）' }); return }
        const args = ['templates', 'create', '--name', name, '--prompt', prompt]
        if (body.category) args.push('--category', String(body.category).trim())
        if (body.ratio) args.push('--ratio', String(body.ratio).trim())
        if (body.description) args.push('--description', String(body.description).trim().slice(0, 200))
        const res = await runMuseav(args, cliOpts())
        if (!res.ok) { sendJson(response, 200, { ok: false, error: res.error }); return }
        sendJson(response, 200, { ok: true, id: res.stdout.trim().split('\n').pop()?.trim() || null })
        return
      }

      if (request.method === 'DELETE') {
        const id = queryOf(request).get('id')?.trim()
        if (!id) { sendJson(response, 400, { ok: false, error: '缺少模板 id' }); return }
        const res = await runMuseav(['templates', 'delete', id], cliOpts())
        if (!res.ok) { sendJson(response, 200, { ok: false, error: res.error }); return }
        sendJson(response, 200, { ok: true, id })
        return
      }

      const params = queryOf(request)
      // 三档归属：mine=我建的 / tenant=本租户 / platform=平台共享。
      // 不传就是全量（102 条），但 tab 默认只拉「我建的 + 本租户」—— 平台共享那 90
      // 多条是别人的东西，混在资产台里只会把真正属于我的埋掉。
      // 认不出来的 source 归一到 all：回显一个没真用上的值比不认更坑。
      const raw = params.get('source')?.trim()
      const source = raw === 'mine' || raw === 'tenant' || raw === 'platform' ? raw : 'all'
      const args = ['templates']
      if (source !== 'all') args.push(`--${source}`)
      const category = params.get('category')?.trim()
      if (category) args.push('--category', category)
      const type = params.get('type')?.trim()
      if (type === 'image' || type === 'article') args.push('--type', type)

      const res = await runMuseav(args, cliOpts())
      if (!res.ok) {
        sendJson(response, 200, { ok: false, error: res.error, templates: [] })
        return
      }
      sendJson(response, 200, { ok: true, source, templates: mergeTemplates(res.stdout, res.stderr) })
    },
  }), 'dsh-museav-assets: templates route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${PREFIX}/jobs`,
    handler: async (request, response) => {
      if (!guard(request, response, ['GET', 'HEAD'])) return
      const params = queryOf(request)
      const raw = Number(params.get('limit') ?? 20)
      const limit = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), MAX_JOBS) : 20
      const project = params.get('project')?.trim()
      const args = ['jobs', '--limit', String(limit)]
      if (project) args.push('--project', project)
      const res = await runMuseav(args, cliOpts())
      if (!res.ok) {
        sendJson(response, 200, { ok: false, error: res.error, jobs: [] })
        return
      }
      sendJson(response, 200, { ok: true, jobs: summarizeJobs(parseJobArray(res.stdout)) })
    },
  }), 'dsh-museav-assets: jobs route')
}
