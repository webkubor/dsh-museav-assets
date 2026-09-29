/**
 * Client 半回归测试 —— 守「注册了但没渲染」和「满 5 个还能点新建」这两类坑。
 *
 * 做法与 dsh-env-inspector 一致：拦下 __ModuleLoader__.load，喂一个假 React，
 * 把 vdom 拍平后断言文本。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PKG_NAME = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8'),
).name

let pluginDefinition = null
globalThis.window = { __ModuleLoader__: { load: (def) => { pluginDefinition = def } } }
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ textContent: '', appendChild: () => {} }),
  head: { appendChild: () => {} },
}

await import('../lib/client.js')

/** 把一棵 vdom 拍平成文本数组，方便断言「页面上到底出现了什么字」。 */
function texts (node, out = []) {
  if (node === null || node === undefined || node === false) return out
  if (Array.isArray(node)) {
    node.forEach((child) => texts(child, out))
    return out
  }
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (node && typeof node === 'object' && 'children' in node) texts(node.children, out)
  return out
}

/** 假 React：hook 按调用顺序吐预设值。 */
function createReact (hookValues) {
  let index = 0
  return {
    createElement: (type, props, ...children) => {
      if (typeof type === 'function') return type({ ...(props ?? {}), children: children.flat() })
      return { type, props: props ?? {}, children: children.flat() }
    },
    useState: (initial) => {
      const value = index < hookValues.length ? hookValues[index] : initial
      index += 1
      return [value, () => {}]
    },
    useEffect: () => {},
    useCallback: (fn) => fn,
  }
}

const T = (key) => key

function render (state, draft = null) {
  const React = createReact([state, draft, false, null])
  const exports = pluginDefinition.factory((name) => (name === 'react' ? React : {}))
  let Component = null
  exports.apply({
    effect: (fn) => fn(),
    locale: { register: () => {}, bind: () => (k) => k },
    slots: { inject: (_, fn) => fn(), register: (_, comp) => { Component = comp } },
  })
  return Component({ t: T })
}

const READY = {
  loading: false, refreshing: false, error: null,
  projects: [
    { id: 'a1', name: 'IP账户运营', genDone: 12, genTotal: 13, assetCount: 1, brand: null },
    { id: 'b2', name: '巴基斯坦站点群', genDone: 33, genTotal: 34, assetCount: 0, brand: 'brandcheck' },
  ],
  used: 2, limit: 5, full: false,
  project: { id: 'a1', name: 'IP账户运营', genDone: 12, genTotal: 13, assetCount: 1, brand: null },
  assets: [{ id: 'x', url: 'https://img/x.png', name: '封面图', mediaType: 'image', tags: [] }],
  assetsError: null,
  jobs: [{ id: 'j', status: 'done', mediaType: 'image', model: 'ChatGPT Image2.5', url: 'https://img/j.png', prompt: '小红书封面', ratio: '3:4', createdAt: '2026-09-29T09:47:57.583131+00:00', workspaceId: null, elapsedMs: 39494, error: null }],
}

test('注册契约：挂到 conversation.view，id 唯一且 order 排在电脑环境(30) 之后', () => {
  assert.ok(pluginDefinition, 'client 脚本必须执行 __ModuleLoader__.load')
  assert.equal(pluginDefinition.id, PKG_NAME)

  const registered = []
  const exports = pluginDefinition.factory(() => createReact([]))
  exports.apply({
    effect: (fn) => fn(),
    locale: { register: () => {}, bind: () => (k) => k },
    slots: { inject: (_, fn) => fn(), register: (cfg, comp) => registered.push({ cfg, comp }) },
  })

  assert.equal(registered.length, 1, '只注册一个面（资产 tab），不铺第二个入口')
  const { cfg, comp } = registered[0]
  assert.equal(cfg.name, 'conversation.view')
  assert.equal(cfg.id, 'museav-assets')
  assert.equal(cfg.order, 40)
  assert.equal(typeof cfg.label, 'function')
  assert.equal(cfg.label(), 'title')
  assert.ok(typeof comp === 'function')
  assert.deepEqual(exports.inject.sort(), ['locale', 'slots'])
})

test('默认落在素材最多的项目上 —— 开在空项目上等于「啥都没有」', () => {
  const exports = pluginDefinition.factory(() => createReact([]))
  const { richestProject } = exports

  // 真机那组：第一个空，唯一有素材的排第 4
  const real = [
    { id: 'a', name: '默认项目', assetCount: 0, genDone: 39 },
    { id: 'b', name: '巴基斯坦站点群', assetCount: 0, genDone: 33 },
    { id: 'c', name: '默认项目', assetCount: 0, genDone: 25 },
    { id: 'd', name: 'IP账户运营', assetCount: 1, genDone: 12 },
  ]
  assert.equal(richestProject(real).id, 'd')

  // 素材数相同时比出图量
  assert.equal(richestProject([
    { id: 'x', assetCount: 3, genDone: 1 },
    { id: 'y', assetCount: 3, genDone: 9 },
  ]).id, 'y')

  // 全空时也要有个落点，别返回 null 让页面空着
  assert.equal(richestProject([{ id: 'z', assetCount: 0, genDone: 0 }]).id, 'z')
  assert.equal(richestProject([]), null)

  // 不能改坏调用方传进来的数组顺序（chip 列表还按原顺序显示）
  const input = [{ id: 'p', assetCount: 0 }, { id: 'q', assetCount: 5 }]
  richestProject(input)
  assert.deepEqual(input.map((x) => x.id), ['p', 'q'])
})

test('渲染：项目名、素材名、出图记录都出现在页面上', () => {
  const text = texts(render(READY)).join(' ')
  assert.match(text, /IP账户运营/)
  assert.match(text, /巴基斯坦站点群/)
  assert.match(text, /封面图/)
  assert.match(text, /小红书封面/)
  assert.match(text, /ChatGPT Image2\.5/)
  assert.match(text, /3:4/)
})

test('渲染：项目 chip 上带素材数与出图计数', () => {
  const text = texts(render(READY)).join(' ')
  assert.match(text, /assetCount/)
  assert.match(text, /genCount/)
})

test('渲染：额度条显示 已用/上限', () => {
  const text = texts(render(READY)).join(' ')
  assert.match(text, /limit/)
})

test('满 5 个时「新建项目」按钮禁用，并给出上限提示', () => {
  const full = { ...READY, used: 5, full: true }
  const vdom = render(full)
  const flat = []
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(walk)
    if (node.props && typeof node.props.onClick === 'function' && node.props.disabled === true) flat.push(node)
    walk(node.children)
  }
  walk(vdom)
  assert.ok(flat.length > 0, '额度满了必须禁用可点按钮')
  assert.match(texts(render(full)).join(' '), /fullHint/)
})

test('空态：一个项目都没有时给的是「去新建」而不是空白', () => {
  const empty = { ...READY, projects: [], project: null, used: 0, assets: [], jobs: [] }
  const text = texts(render(empty)).join(' ')
  assert.match(text, /emptyProjects/)
  assert.match(text, /emptyAssets/)
})

test('加载中只显示一个占位，不先渲染半截数据', () => {
  const text = texts(render({ ...READY, loading: true })).join(' ')
  assert.equal(text.trim(), '…')
})

test('CLI 报错时错误条里带上登录提示', () => {
  const text = texts(render({ ...READY, error: 'exit 1' })).join(' ')
  assert.match(text, /exit 1/)
  assert.match(text, /loginHint/)
})
