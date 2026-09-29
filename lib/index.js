/**
 * dsh-museav-assets —— Host（Node）半。
 *
 * 职责只有一件事：把 museav CLI 的输出变成 client 半能直接渲染的 JSON。
 * 自己不碰 ~/.museav.json，不转发 token —— 认证是 CLI 的事（见 lib/museav.js）。
 *
 * 路由（全部 exact，一次注册，路径唯一 —— 重复注册会整棵 Cordis 崩）：
 *   GET  /api/dsh-museav-assets/health     CLI 在不在、什么版本
 *   GET  /api/dsh-museav-assets/projects   工作区列表（id + 名称 + 出图/素材计数）
 *   POST /api/dsh-museav-assets/projects   { name } 新建工作区
 *   GET  /api/dsh-museav-assets/assets?project=<id|名>   工作区素材库
 *   GET  /api/dsh-museav-assets/jobs?limit=<n>          最近出图记录
 *
 * 失败语义：上游/CLI 出错一律 200 + `{ok:false,error}`，让 tab 内联显示原因；
 * 只有「参数不合法」才回 400。tab 不因为一次网络抖动变成白屏。
 */

import z from '@deepseek-ai/schemastery'
import {
  runMuseav,
  mergeProjects,
  mergeAssets,
  parseJobArray,
  summarizeJobs,
  PROJECT_LIMIT,
} from './museav.js'

export const name = 'dsh-museav-assets'

/** 只需要 HTTP 载体。CLI 是外部进程，不需要 dsh 的 llm / settings / storage。 */
export const inject = ['webServer']

/**
 * 插件配置。默认值面向本机已 `museav login` 的用户。
 * cliBin 可指向别处 —— 测试就是靠它换成 stub 可执行文件，不联网。
 */
export const Config = z.object({
  /** museav 可执行文件名或绝对路径。 */
  cliBin: z.string().default('museav'),
  /** 单条 CLI 命令的超时（毫秒）。出图类慢，列表类快，这里给列表用的宽松值。 */
  timeoutMs: z.number().default(30000),
  /** 出图记录单次最多取几条（服务端固定只返回最近 50 条）。 */
  maxJobs: z.number().default(50),
})

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

/** 读 JSON 请求体（限长 4KB —— 这个接口的入参只有一个项目名）。 */
function readJsonBody (request) {
  return new Promise((resolve) => {
    let raw = ''
    request.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 4096) request.destroy()
    })
    request.on('end', () => {
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
  const config = ctx.config ?? {}
  const cliOpts = { bin: config.cliBin, timeoutMs: config.timeoutMs }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${PREFIX}/health`,
    handler: async (request, response) => {
      if (!guard(request, response, ['GET', 'HEAD'])) return
      const res = await runMuseav(['--version'], cliOpts)
      sendJson(response, 200, {
        ok: res.ok,
        cli: {
          bin: config.cliBin,
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
        const res = await runMuseav(['projects', 'create', '--name', name], cliOpts)
        if (!res.ok) {
          sendJson(response, 200, { ok: false, error: res.error })
          return
        }
        sendJson(response, 200, { ok: true, id: res.stdout.trim() || null })
        return
      }

      const res = await runMuseav(['projects'], cliOpts)
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
      if (!guard(request, response, ['GET', 'HEAD'])) return
      const project = queryOf(request).get('project')?.trim()
      if (!project) {
        sendJson(response, 400, { ok: false, error: '缺少 project（工作区 id 或名称）' })
        return
      }
      const res = await runMuseav(['projects', 'assets', '--project', project], cliOpts)
      if (!res.ok) {
        sendJson(response, 200, { ok: false, error: res.error, assets: [] })
        return
      }
      sendJson(response, 200, { ok: true, project, assets: mergeAssets(res.stdout, res.stderr) })
    },
  }), 'dsh-museav-assets: assets route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${PREFIX}/jobs`,
    handler: async (request, response) => {
      if (!guard(request, response, ['GET', 'HEAD'])) return
      const params = queryOf(request)
      const raw = Number(params.get('limit') ?? 20)
      const limit = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), config.maxJobs) : 20
      const project = params.get('project')?.trim()
      const args = ['jobs', '--limit', String(limit)]
      if (project) args.push('--project', project)
      const res = await runMuseav(args, cliOpts)
      if (!res.ok) {
        sendJson(response, 200, { ok: false, error: res.error, jobs: [] })
        return
      }
      sendJson(response, 200, { ok: true, jobs: summarizeJobs(parseJobArray(res.stdout)) })
    },
  }), 'dsh-museav-assets: jobs route')
}
