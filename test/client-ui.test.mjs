/**
 * Client 半回归测试 —— 守「注册了但没渲染」「额度满了还能新建」「模板被挤到屏外」这类坑。
 *
 * 做法与 dsh-env-inspector 一致：拦下 __ModuleLoader__.load，喂一个假 React，
 * 把 vdom 拍平后断言「页面上到底出现了什么字」。
 *
 * hook 顺序是硬约束：组件里 useState/useRef 的调用顺序变了，这里的 hookValues 顺序就得跟着变，
 * 否则值会串到别的 state 上（v0.2 重写出图台时踩过一次：form 拿到了 toast 的值）。
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

/** 把一棵 vdom 拍平成文本数组。 */
function texts (node, out = []) {
  if (node === null || node === undefined || node === false) return out
  if (Array.isArray(node)) { node.forEach((c) => texts(c, out)); return out }
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out }
  if (node && typeof node === 'object' && 'children' in node) texts(node.children, out)
  return out
}

/** 遍历 vdom 找节点，pred 命中即收。 */
function findAll (root, pred, out = []) {
  if (!root || typeof root !== 'object') return out
  if (Array.isArray(root)) { root.forEach((n) => findAll(n, pred, out)); return out }
  if (pred(root)) out.push(root)
  findAll(root.children, pred, out)
  return out
}

/** 假 React：hook 按调用顺序吐预设值。 */
function createReact (hookValues) {
  let index = 0
  const next = (initial) => {
    const value = index < hookValues.length ? hookValues[index] : initial
    index += 1
    return value
  }
  return {
    createElement: (type, props, ...children) => {
      if (typeof type === 'function') return type({ ...(props ?? {}), children: children.flat() })
      return { type, props: props ?? {}, children: children.flat() }
    },
    useState: (initial) => [next(initial), () => {}],
    useRef: (initial) => ({ current: next(initial) }),
    useEffect: () => {},
    useCallback: (fn) => fn,
  }
}

const T = (key) => key

const EMPTY_FORM = { prompt: '', ratio: '3:4', templateId: '', fields: {}, refs: [] }

const READY = {
  loading: false, refreshing: false, error: null,
  projects: [
    { id: 'a1', name: '默认项目', genDone: 39, genTotal: 43, assetCount: 0, brand: null },
    { id: 'b2', name: 'IP账户运营', genDone: 12, genTotal: 13, assetCount: 1, brand: null },
  ],
  used: 2, limit: 5, full: false,
  project: { id: 'b2', name: 'IP账户运营', genDone: 12, genTotal: 13, assetCount: 1, brand: null },
  assets: [{ id: 'x', url: 'https://img/x.png', name: '封面图', mediaType: 'image', tags: [] }],
  assetsError: null,
  jobs: [{ id: 'j', status: 'done', mediaType: 'image', model: 'ChatGPT Image2.5', url: 'https://img/j.png', prompt: '小红书封面', ratio: '3:4', createdAt: '2026-09-29T09:47:57.583131+00:00', workspaceId: null, elapsedMs: 39494, error: null }],
  templates: [
    { id: '9798dde2', name: '演唱会海报·小红书风', version: 'v1.0.0', ratio: '3:4', fieldCount: 7, fields: ['subject', 'title'], source: '个人', type: '图片' },
    { id: '5c421770', name: '电商信任页 · 保障收尾', version: 'v1.0.0', ratio: '3:4', fieldCount: 5, fields: ['lang', 'product'], source: '平台', type: '图片' },
  ],
  templatesError: null,
}

/**
 * 渲染一帧。hook 顺序必须与 AssetsView 里的调用顺序一致：
 * state, form, running, toast, draft, busy, uploading, pendingDelete, zoom, tplForm, tplBusy, tplSource
 */
function render ({ state = READY, form = EMPTY_FORM, zoom = null, tplForm = null, draft = null } = {}) {
  const React = createReact([
    state, form, false, null, draft, false, false, null, zoom, tplForm, false, 'mine',
  ])
  const exports = pluginDefinition.factory((name) => (name === 'react' ? React : {}))
  let Component = null
  exports.apply({
    effect: (fn) => fn(),
    locale: { register: () => {}, bind: () => T },
    slots: { inject: (_, fn) => fn(), register: (_, comp) => { Component = comp } },
  })
  return Component({ t: T })
}

test('注册契约：挂到 conversation.view，id 唯一且 order 排在电脑环境(30) 之后', () => {
  assert.ok(pluginDefinition, 'client 脚本必须执行 __ModuleLoader__.load')
  assert.equal(pluginDefinition.id, PKG_NAME)

  const registered = []
  const exports = pluginDefinition.factory(() => createReact([]))
  exports.apply({
    effect: (fn) => fn(),
    locale: { register: () => {}, bind: () => T },
    slots: { inject: (_, fn) => fn(), register: (cfg, comp) => registered.push({ cfg, comp }) },
  })

  assert.equal(registered.length, 1, '只注册一个面（资产 tab），不铺第二个入口')
  const { cfg, comp } = registered[0]
  assert.equal(cfg.name, 'conversation.view')
  assert.equal(cfg.id, 'museav-assets')
  assert.equal(cfg.order, 40)
  assert.equal(cfg.label(), 'title')
  assert.ok(typeof comp === 'function')
  assert.deepEqual(exports.inject.sort(), ['locale', 'slots'])
})

test('默认落在素材最多的项目上 —— 开在空项目上等于「啥都没有」', () => {
  const { richestProject } = pluginDefinition.factory(() => createReact([]))
  const real = [
    { id: 'a', name: '默认项目', assetCount: 0, genDone: 39 },
    { id: 'b', name: '巴基斯坦站点群', assetCount: 0, genDone: 33 },
    { id: 'c', name: '默认项目', assetCount: 0, genDone: 25 },
    { id: 'd', name: 'IP账户运营', assetCount: 1, genDone: 12 },
  ]
  assert.equal(richestProject(real).id, 'd')
  assert.equal(richestProject([{ id: 'x', assetCount: 3, genDone: 1 }, { id: 'y', assetCount: 3, genDone: 9 }]).id, 'y')
  assert.equal(richestProject([{ id: 'z', assetCount: 0, genDone: 0 }]).id, 'z')
  assert.equal(richestProject([]), null)
  // 不能改坏调用方传进来的数组（chip 列表还按原顺序显示）
  const input = [{ id: 'p', assetCount: 0 }, { id: 'q', assetCount: 5 }]
  richestProject(input)
  assert.deepEqual(input.map((x) => x.id), ['p', 'q'])
})

test('出图台是这个 tab 的第一段：提示词框 + 比例 + 模板 + 出图按钮', () => {
  const vdom = render()
  const text = texts(vdom).join(' ')
  assert.match(text, /studio/, '出图台必须在')
  const ta = findAll(vdom, (n) => n.type === 'textarea')
  assert.ok(ta.length >= 1, '要有提示词输入框')
  assert.equal(ta[0].props.className, 'dma-prompt')
  // 比例下拉：按「选项值里含 9:16」认 —— 模板下拉的文案里也带 3:4，只搜 3:4 会认错
  const ratioSelect = findAll(vdom, (n) => n.type === 'select')
    .find((n) => findAll(n, (x) => x.type === 'option').some((o) => o.props.value === '9:16'))
  assert.ok(ratioSelect, '要有比例选择器')
  assert.deepEqual(findAll(ratioSelect, (n) => n.type === 'option').map((o) => o.props.value),
    ['3:4', '9:16', '1:1', '4:3', '16:9'])
  const gen = findAll(vdom, (n) => n.props?.className === 'dma-gen')
  assert.equal(gen.length, 1, '只有一个出图按钮')
  assert.equal(gen[0].props.disabled, true, '没提示词也没模板时，出图按钮必须是禁用的')
})

test('选了模板就摊开它的字段', () => {
  const vdom = render({ form: { ...EMPTY_FORM, templateId: '9798dde2' } })
  assert.match(texts(vdom).join(' '), /viaTemplate/)
  const labels = findAll(vdom, (n) => n.props?.className === 'dma-field')
  assert.equal(labels.length, 2, '模板有 2 个占位符就该渲染 2 个输入框')
})

test('作品墙是网格看图，不是报表列表', () => {
  const vdom = render()
  const walls = findAll(vdom, (n) => n.props?.className === 'dma-wall')
  assert.equal(walls.length, 1, '要有作品墙')
  const imgs = findAll(walls[0], (n) => n.type === 'img')
  assert.equal(imgs.length, 1, '每件作品是一张图')
  // 旧版那一套（一行一条的 dma-job 列表）不该再出现
  assert.equal(findAll(vdom, (n) => n.props?.className === 'dma-job').length, 0, '流水列表已被作品墙取代')
})

test('作品墙缩略图：前 12 张 eager，之后 lazy', () => {
  const many = { ...READY, jobs: Array.from({ length: 20 }, (_, i) => ({ ...READY.jobs[0], id: `j${i}` })) }
  const wall = findAll(render({ state: many }), (n) => n.props?.className === 'dma-wall')[0]
  const imgs = findAll(wall, (n) => n.type === 'img')
  assert.equal(imgs.filter((i) => i.props.loading === 'eager').length, 12, '首屏 12 张预载')
  assert.equal(imgs.filter((i) => i.props.loading === 'lazy').length, 8, '其余懒加载')
})

test('模板管理段：新增 / 分享 / 删除入口都在，平台共享的不给管理按钮', () => {
  const vdom = render()
  const text = texts(vdom).join(' ')
  assert.match(text, /tplNew/, '要有新增模板入口')
  assert.match(text, /tplMine/)
  assert.match(text, /tplPlatform/)

  const rows = findAll(vdom, (n) => n.props?.className === 'dma-tpl')
  assert.equal(rows.length, 2, '两条模板各一行')
  assert.match(texts(rows[0]).join(' '), /tplShare/, '我建的模板要有分享按钮')
  assert.match(texts(rows[0]).join(' '), /tplDelete/, '我建的模板要有删除按钮')
  const platform = texts(rows[1]).join(' ')
  assert.doesNotMatch(platform, /tplShare/, '平台共享的模板不是我建的，不该给分享按钮')
  assert.doesNotMatch(platform, /tplDelete/, '平台共享的模板不该给删除按钮')
})

test('打开新增模板表单后，名字和提示词都有输入位', () => {
  const form = findAll(render({ tplForm: { name: '', prompt: '', category: '', ratio: '3:4' } }),
    (n) => n.props?.className === 'dma-tpl-form')
  assert.equal(form.length, 1, '表单要弹出来')
  const placeholders = findAll(form[0], (n) => n.props?.placeholder).map((n) => n.props.placeholder)
  assert.ok(placeholders.includes('tplName'), `缺名字输入位：${JSON.stringify(placeholders)}`)
  assert.ok(placeholders.includes('tplPrompt'), '缺提示词模板输入位')
  assert.ok(placeholders.includes('tplCategory'), '缺分类输入位')
  const create = findAll(form[0], (n) => n.props?.className === 'dma-gen')
  assert.equal(create[0].props.disabled, true, '名字和提示词都空着时不能提交')
})

test('素材格点一下就是选垫图，已选的描边高亮', () => {
  // 注意别把 dma-asset-del（删除按钮）/ dma-asset-cap（图注）也算成格子
  const isTile = (n) => typeof n.props?.className === 'string' && /^dma-asset( |$)/.test(n.props.className)
  const tiles = findAll(render(), isTile)
  assert.equal(tiles.length, 1, `应只有 1 张素材，实际 ${tiles.length}`)
  assert.doesNotMatch(tiles[0].props.className, /is-ref/, '没选时不该有选中态')

  const vdom2 = render({ form: { ...EMPTY_FORM, refs: ['https://img/x.png'] } })
  const tiles2 = findAll(vdom2, isTile)
  assert.match(tiles2[0].props.className, /is-ref/, '选中后要有高亮')
  assert.match(texts(vdom2).join(' '), /refs/, '出图台要显示已选垫图')
})

test('项目 chip 带素材数与出图计数；满 5 个时新建禁用', () => {
  assert.match(texts(render()).join(' '), /assetCount/)
  assert.match(texts(render()).join(' '), /genCount/)
  const full = render({ state: { ...READY, used: 5, full: true } })
  assert.ok(findAll(full, (n) => n.props?.disabled === true).length > 0, '额度满了必须禁用可点按钮')
  // 满额提示挂在 title 上（hover 才看得到），不在文本流里
  assert.ok(findAll(full, (n) => typeof n.props?.title === 'string' && n.props.title.includes('fullHint')).length > 0,
    '满额时新建按钮要带 title 提示')
})

test('素材为空时要指路到「哪个项目有素材」', () => {
  const vdom = render({ state: { ...READY, project: READY.projects[0], assets: [] } })
  assert.ok(findAll(vdom, (n) => n.props?.className === 'dma-jump').some((j) => texts(j).join('') === 'jumpTo'),
    '空态要给出跳转按钮')
  const none = { ...READY, projects: READY.projects.map((p) => ({ ...p, assetCount: 0 })) }
  const vdom2 = render({ state: { ...none, project: none.projects[0], assets: [] } })
  assert.equal(
    findAll(vdom2, (n) => n.props?.className === 'dma-jump').filter((j) => texts(j).join('').includes('→')).length,
    0, '没的可指就不显示',
  )
})

test('加载中只显示占位，不先渲染半截数据', () => {
  assert.equal(texts(render({ state: { ...READY, loading: true } })).join('').trim(), '…')
})

test('CLI 报错时错误条里带上登录提示', () => {
  const text = texts(render({ state: { ...READY, error: 'exit 1' } })).join(' ')
  assert.match(text, /exit 1/)
  assert.match(text, /loginHint/)
})

test('点开作品出放大层，里面能复制直链和复用提示词', () => {
  const zoom = findAll(render({ zoom: READY.jobs[0] }), (n) => n.props?.className === 'dma-zoom')
  assert.equal(zoom.length, 1, '要点得开')
  const text = texts(zoom[0]).join(' ')
  assert.match(text, /copyUrl/)
  assert.match(text, /reuse/)
  assert.match(text, /小红书封面/)
})

test('失败任务在作品墙上显示状态点，不是空白方块', () => {
  const failed = { ...READY, jobs: [{ ...READY.jobs[0], status: 'failed', url: null, error: '生成失败了' }] }
  const vdom = render({ state: failed })
  const work = findAll(vdom, (n) => n.props?.className === 'dma-work is-failed')
  assert.equal(work.length, 1, '失败作品单独标出来')
  assert.equal(work[0].props.onClick(), null, '失败作品点不开大图')
  assert.match(texts(vdom).join(' '), /生成失败了/)
})
