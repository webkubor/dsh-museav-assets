/**
 * 认证状态探测测试（2026-11-10）。
 *
 * 守的是这个真实缺陷：
 *   原来 `/health` 只跑 `museav --version` —— **那条命令不需要登录，永远成功**。
 *   于是 token 过期时：面板显示一切正常，`/projects`、`/assets`、`/jobs` 全挂，
 *   用户只看到一句干巴巴的 `unauthorized`，既不知道是登录问题，也不知道怎么修。
 *
 * 这组测试全程用 stub 顶替 CLI，不联网、不碰真账号。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter } from 'node:events'
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const { probeAuth, isAuthFailure } = await import(
  new URL('../lib/museav.js', import.meta.url).href
)

/**
 * 造一个 stub museav：按 MUSEAV_STUB_MODE 模拟三种情况。
 *   expired  —— 未登录/凭证过期（真机原话）
 *   free     —— 凭证缺失被降级成匿名身份（真机原话）
 *   ok       —— 正常
 *   crash    —— CLI 本身坏了（不是认证问题）
 */
function makeStub (mode) {
  const dir = mkdtempSync(join(tmpdir(), 'museav-auth-stub-'))
  const bin = join(dir, 'museav')
  writeFileSync(bin, `#!/bin/sh
case "$1" in
  --version) echo "3.16.0"; exit 0 ;;
  projects)
    case "${mode}" in
      expired) echo "❌ 中台 API /api/workspaces 失败: unauthorized" >&2; exit 1 ;;
      free) echo "❌ 当前消费等级（free）没有可用的图片上游" >&2; exit 1 ;;
      crash) echo "Error: spawn museav ENOENT" >&2; exit 127 ;;
      *) printf '11111111-2222-3333-4444-555555555555\\n'; exit 0 ;;
    esac ;;
  *) exit 0 ;;
esac
`.replace('${mode}', mode))
  chmodSync(bin, 0o755)
  return bin
}

test('probeAuth reports ok when the CLI works', async () => {
  const bin = makeStub('ok')
  const res = await probeAuth({ bin, timeoutMs: 15000 })
  assert.equal(res.auth, 'ok')
  assert.equal(res.error, null)
})

test('probeAuth reports expired when the token is rejected', async () => {
  const bin = makeStub('expired')
  const res = await probeAuth({ bin, timeoutMs: 15000 })
  assert.equal(res.auth, 'expired')
  assert.match(res.error, /unauthorized/)
})

test('probeAuth reports expired when the platform downgrades to the free tier', async () => {
  const bin = makeStub('free')
  const res = await probeAuth({ bin, timeoutMs: 15000 })
  assert.equal(res.auth, 'expired')
})

test('probeAuth reports unknown when the CLI itself is broken', async () => {
  const bin = makeStub('crash')
  const res = await probeAuth({ bin, timeoutMs: 15000 })
  // 关键：CLI 坏了**不是**认证问题，不能让用户去重新登录
  assert.equal(res.auth, 'unknown')
})

test('probeAuth reports unknown when the CLI is missing', async () => {
  const res = await probeAuth({ bin: join(tmpdir(), 'museav-does-not-exist-xyz'), timeoutMs: 8000 })
  assert.equal(res.auth, 'unknown')
})

test('isAuthFailure matches the real CLI messages and rejects others', () => {
  assert.equal(isAuthFailure('❌ 中台 API /api/me 失败: unauthorized'), true)
  assert.equal(isAuthFailure('HTTP 401 Unauthorized'), true)
  assert.equal(isAuthFailure('还没登录，先跑 museav login'), true)
  assert.equal(isAuthFailure('❌ 当前消费等级（free）没有可用的图片上游'), true)
  // 无关错误不能被误判成认证问题
  assert.equal(isAuthFailure('Error: spawn museav ENOENT'), false)
  assert.equal(isAuthFailure('❌ 中台 API /api/generate 失败: 500'), false)
  assert.equal(isAuthFailure(''), false)
  assert.equal(isAuthFailure(null), false)
})

test('the health route reports auth state instead of only the CLI version', async () => {
  // 直接验路由行为：起一个最小的 webServer stub，打 /health
  const bin = makeStub('expired')
  const { apply } = await import(new URL('../lib/index.js', import.meta.url).href)
  const routes = new Map()
  const previous = process.env.MUSEAW_BIN
  process.env.MUSEAW_BIN = bin
  try {
    apply({
      effect: (fn) => fn(),
      webServer: { register: (route) => { routes.set(route.path, route.handler) } },
    })
    const handler = routes.get('/api/dsh-museav-assets/health')
    assert.ok(handler, 'health route must be registered')
    let payload = null
    const response = {
      statusCode: null,
      writeHead (code) { this.statusCode = code },
      setHeader () {},
      end (body) { payload = JSON.parse(body) },
    }
    const request = new EventEmitter()
    request.method = 'GET'
    request.headers = { origin: 'http://127.0.0.1' }
    request.url = '/api/dsh-museav-assets/health'
    await handler(request, response)
    assert.equal(payload.ok, true, 'CLI itself is installed, so ok stays true')
    assert.equal(payload.auth, 'expired')
    assert.equal(payload.authRequired, true)
    assert.match(payload.authHint, /museav login/)
  } finally {
    if (previous === undefined) delete process.env.MUSEAW_BIN
    else process.env.MUSEAW_BIN = previous
  }
})

test('the projects route flags an auth failure so the UI can prompt for login', async () => {
  const bin = makeStub('expired')
  const { apply } = await import(new URL('../lib/index.js', import.meta.url).href)
  const routes = new Map()
  const previous = process.env.MUSEAW_BIN
  process.env.MUSEAW_BIN = bin
  try {
    apply({
      effect: (fn) => fn(),
      webServer: { register: (route) => { routes.set(route.path, route.handler) } },
    })
    let payload = null
    const response = {
      statusCode: null,
      writeHead (code) { this.statusCode = code },
      setHeader () {},
      end (body) { payload = JSON.parse(body) },
    }
    const request = new EventEmitter()
    request.method = 'GET'
    request.headers = { origin: 'http://127.0.0.1' }
    request.url = '/api/dsh-museav-assets/projects'
    await routes.get('/api/dsh-museav-assets/projects')(request, response)
    assert.equal(payload.ok, false)
    assert.equal(payload.authRequired, true, '认证失败必须带这个标志，UI 才能渲染去登录引导')
    assert.match(payload.error, /museav login/)
    assert.deepEqual(payload.projects, [], '空态字段不能丢')
  } finally {
    if (previous === undefined) delete process.env.MUSEAW_BIN
    else process.env.MUSEAW_BIN = previous
  }
})
