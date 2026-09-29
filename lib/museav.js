/**
 * dsh-museav-assets —— museav CLI 适配层（纯解析 + 进程调用）。
 *
 * 这是**唯一**知道 museav CLI 输出长什么样的文件。路由和 UI 只认这里吐出的结构化
 * 对象；CLI 改文案，改这一个文件 + 它的测试就够，不用动 UI。
 *
 * CLI 的 stdout/stderr 分工是它自己的**契约**（真源 museav-cli/src/commands/projects.ts）：
 *   - stdout 给脚本：projects → id 换行；projects assets → `id\turl`；jobs → 完整 JSON
 *     数组；projects create → 新建工作区 id
 *   - stderr 给人看：名称 / 出图计数 / 素材数 / media_type / tags
 * 所以**真值一律取 stdout**，stderr 只用来补展示字段。stderr 解析不出来就降级成
 * 只显示 id —— 上游改一句中文不能让整个 tab 变空白。
 *
 * 认证：CLI 自己管 ~/.museav.json 的 token，本插件既不读它也不转发它。
 * 没登录时 CLI 报错，这里原样把 stderr 带回去。
 */

import { execFile } from 'node:child_process'

/** 上游工作区数量上限（museav projects create 的服务端限制）。 */
export const PROJECT_LIMIT = 5

/** UUID —— 只认标准 8-4-4-4-12，避免把表格里的别的 token 误当 id。 */
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'

/**
 * 跑一条 museav CLI 命令。
 *
 * 不用 shell —— 参数走数组，project 名里的空格/引号不会被解释成别的命令。
 *
 * @param {string[]} args 例如 `['projects', '--project', 'IP 账户运营']`
 * @param {{bin?: string, timeoutMs?: number}} [opts]
 * @returns {Promise<{ok: boolean, code: number|null, stdout: string, stderr: string, error: string|null}>}
 */
export function runMuseav (args, opts = {}) {
  const bin = opts.bin || 'museav'
  const timeoutMs = opts.timeoutMs ?? 30000
  return new Promise((resolve) => {
    execFile(
      bin,
      args,
      { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, env: process.env },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ ok: true, code: 0, stdout: stdout ?? '', stderr: stderr ?? '', error: null })
          return
        }
        // 超时也会走到这里；code 为 null 时不要伪装成 exit 1。
        const timedOut = error.killed === true || error.code === 'ETIMEDOUT'
        resolve({
          ok: false,
          code: typeof error.code === 'number' ? error.code : null,
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          error: timedOut
            ? `museav ${args[0] ?? ''} 超时（${timeoutMs}ms）`
            : (stderr || error.message || '').trim(),
        })
      },
    )
  })
}

/**
 * `museav projects` 的 stdout —— 每行一个 id，这是契约。
 * @param {string} stdout
 * @returns {string[]}
 */
export function parseProjectIds (stdout) {
  return String(stdout ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => new RegExp(`^${UUID}$`).test(line))
}

/**
 * `museav projects` 的 stderr 表格 —— 人看的补展示字段，解析失败不致命。
 *
 * 表格行长这样（注意 name 是 padEnd(16)，名字 ≥16 字时列间只有 1 个空格，
 * 所以分隔一律用「非贪婪 + \s+ 出图」而不是固定宽度）：
 *   `  <uuid>  默认项目        出图 39/43  素材 0  brand:brandcheck`
 *
 * @param {string} stderr
 * @returns {Map<string, {name: string, genDone: number, genTotal: number, assetCount: number, brand: string|null}>}
 */
export function parseProjectTable (stderr) {
  const out = new Map()
  const re = new RegExp(
    `^\\s{2}(${UUID})\\s+(\\S.*?)\\s+出图\\s+(\\d+)\\/(\\d+)\\s+素材\\s+(\\d+)(?:\\s+brand:(\\S+))?\\s*$`,
  )
  for (const line of String(stderr ?? '').split('\n')) {
    const m = re.exec(line)
    if (!m) continue
    out.set(m[1], {
      name: m[2].trim(),
      genDone: Number(m[3]),
      genTotal: Number(m[4]),
      assetCount: Number(m[5]),
      brand: m[6] ?? null,
    })
  }
  return out
}

/**
 * stdout 的 id 列表 + stderr 的展示字段合并。
 * stdout 说了算：stderr 里多/少的行都不会改变 id 集合与顺序。
 *
 * @param {string} stdout
 * @param {string} stderr
 * @returns {{id: string, name: string, genDone: number, genTotal: number, assetCount: number, brand: string|null}[]}
 */
export function mergeProjects (stdout, stderr) {
  const table = parseProjectTable(stderr)
  return parseProjectIds(stdout).map((id) => {
    const row = table.get(id)
    return {
      id,
      name: row?.name ?? id.slice(0, 8),
      genDone: row?.genDone ?? null,
      genTotal: row?.genTotal ?? null,
      assetCount: row?.assetCount ?? null,
      brand: row?.brand ?? null,
    }
  })
}

/**
 * `museav projects assets` 的 stdout —— `id\turl` 每行一条（agent 直接拿去当 --ref）。
 * @param {string} stdout
 * @returns {{id: string, url: string}[]}
 */
export function parseAssetTsv (stdout) {
  const out = []
  for (const line of String(stdout ?? '').split('\n')) {
    if (!line.includes('\t')) continue
    const idx = line.indexOf('\t')
    const id = line.slice(0, idx).trim()
    const url = line.slice(idx + 1).trim()
    if (!url) continue
    if (!new RegExp(`^${UUID}$`).test(id)) continue
    out.push({ id, url })
  }
  return out
}

/**
 * stderr 表格：`  <uuid>  (未命名)          image  [tag1,tag2]`
 * @param {string} stderr
 * @returns {Map<string, {name: string, mediaType: string, tags: string[]}>}
 */
export function parseAssetTable (stderr) {
  const out = new Map()
  const re = new RegExp(`^\\s{2}(${UUID})\\s+(\\S.*?)\\s+([a-zA-Z]+)\\s*(?:\\[([^\\]]*)\\])?\\s*$`)
  for (const line of String(stderr ?? '').split('\n')) {
    const m = re.exec(line)
    if (!m) continue
    out.set(m[1], {
      name: m[2].trim(),
      mediaType: m[3].trim(),
      tags: m[4] ? m[4].split(',').map((t) => t.trim()).filter(Boolean) : [],
    })
  }
  return out
}

/**
 * @param {string} stdout
 * @param {string} stderr
 * @returns {{id: string, url: string, name: string, mediaType: string, tags: string[]}[]}
 */
export function mergeAssets (stdout, stderr) {
  const table = parseAssetTable(stderr)
  return parseAssetTsv(stdout).map(({ id, url }) => {
    const row = table.get(id)
    return {
      id,
      url,
      name: row?.name ?? '(未命名)',
      mediaType: row?.mediaType ?? (/\.(mp4|mov|webm)(\?|$)/i.test(url) ? 'video' : /\.(mp3|wav|m4a)(\?|$)/i.test(url) ? 'audio' : 'image'),
      tags: row?.tags ?? [],
    }
  })
}

/**
 * `museav jobs` 的 stdout 是完整 JSON 数组（不是表格），直接 parse。
 * @param {string} stdout
 * @returns {object[]}
 */
export function parseJobArray (stdout) {
  const text = String(stdout ?? '').trim()
  if (!text) return []
  try {
    const data = JSON.parse(text)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

/**
 * 出图记录只留 tab 要显示的字段 —— prompt 可能几百字，整包塞进 JSON 响应是浪费。
 *
 * 注意 workspace_id 在客户端登录态下常常是 null（见真机输出），所以 --project
 * 的过滤在 CLI 侧本来就可能筛不出东西；这里不过滤，只如实显示返回的记录。
 *
 * @param {object[]} jobs
 * @returns {{id: string, status: string, mediaType: string, model: string, url: string|null, prompt: string, ratio: string|null, createdAt: string|null, workspaceId: string|null, elapsedMs: number|null, error: string|null}[]}
 */
export function summarizeJobs (jobs) {
  return jobs.map((job) => ({
    id: job.id,
    status: job.status ?? 'unknown',
    mediaType: job.media_type ?? 'image',
    model: job.model ?? '',
    url: job.cdn_url ?? null,
    prompt: typeof job.prompt === 'string' ? job.prompt : '',
    ratio: job.ratio ?? null,
    createdAt: job.created_at ?? null,
    workspaceId: job.workspace_id ?? null,
    elapsedMs: typeof job.elapsed_ms === 'number' ? job.elapsed_ms : null,
    error: job.error ?? null,
  }))
}

/**
 * 找「可当 --ref 用的素材 URL」—— 出图记录里的垫图 / 生成结果。
 * @param {{id: string, url: string, mediaType: string}[]} assets
 * @param {string} needle
 * @returns {string[]}
 */
export function pickAssetUrls (assets, needle) {
  const key = String(needle ?? '').trim().toLowerCase()
  if (!key) return []
  return assets.filter((a) => a.url.toLowerCase().includes(key)).map((a) => a.url)
}
