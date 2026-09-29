/**
 * dsh-museav-assets —— Client（浏览器）半。
 *
 * 注册为 conversation.view 的第 6 个 tab「资产」（order 40，排在对话/轨迹/记忆/上下文/
 * 电脑环境之后）。左边选项目，右边看这个项目的素材库和最近出图。
 *
 * 只做三件事，一件不多：
 *   1. 列出工作区（项目），并显示每个项目的素材数与出图计数
 *   2. 看某个项目的素材库，点一下复制素材 URL（agent 拿去当 --ref 垫图）
 *   3. 看最近出图记录
 *
 * 不做的事：不在这里出图、不传文件。出图走 museav CLI / MCP 工具，插件不重复造。
 *
 * @module dsh-museav-assets/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-museav-assets',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports

    // @ts-ignore
    const React = require('react')
    const h = React.createElement

    const NS = 'dsh-museav-assets'
    const API = '/api/dsh-museav-assets'
    const STORE_KEY = 'dsh-museav-assets:project'

    const LOCALES = {
      zh: {
        title: '资产',
        subtitle: '按项目管素材。点素材复制直链，可直接当垫图（--ref）用。',
        projects: '项目',
        assets: '素材库',
        jobs: '最近出图',
        newProject: '＋ 新建项目',
        refresh: '🔄 刷新',
        creating: '创建中…',
        namePlaceholder: '项目名（≤20 字）',
        emptyProjects: '还没有项目。点右上角「新建项目」开一个。',
        emptyAssets: '这个项目还没有素材。',
        emptyJobs: '还没有出图记录。',
        fullHint: '工作区已满（{used}/{limit}），新建会被服务端拒绝。',
        genCount: '出图 {done}/{total}',
        assetCount: '素材 {n}',
        copied: '已复制素材直链',
        loadFailed: '读取失败',
        loginHint: 'CLI 读不到数据，多半是没登录：终端跑 museav login。',
        limit: '{used}/{limit} 个项目',
        brand: 'brand:{brand}',
      },
      en: {
        title: 'Assets',
        subtitle: 'Assets by project. Click an asset to copy its direct URL for use as a ref image (--ref).',
        projects: 'Projects',
        assets: 'Library',
        jobs: 'Recent generations',
        newProject: '＋ New project',
        refresh: '🔄 Refresh',
        creating: 'Creating…',
        namePlaceholder: 'Project name (≤20 chars)',
        emptyProjects: 'No project yet. Create one with the button above.',
        emptyAssets: 'This project has no assets yet.',
        emptyJobs: 'No generation records yet.',
        fullHint: 'Workspace is full ({used}/{limit}); the server will refuse new ones.',
        genCount: 'gen {done}/{total}',
        assetCount: 'assets {n}',
        copied: 'Asset URL copied',
        loadFailed: 'Failed to load',
        loginHint: 'The CLI returned no data — you are probably not logged in: run museav login.',
        limit: '{used}/{limit} projects',
        brand: 'brand:{brand}',
      },
    }

    const CSS = `
      .dsh-museav-view {
        padding: 16px 20px 120px; font-size: 13px; line-height: 1.6;
        height: 100%; overflow: auto;
      }
      .dsh-museav-view > * { max-width: 1080px; margin-left: auto; margin-right: auto; }

      .dma-head {
        display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
        padding: 12px 14px; border-radius: 12px; margin-bottom: 14px;
        background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.02));
        border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.06));
      }
      .dma-head-eyebrow {
        font-size: 10px; letter-spacing: .15em; text-transform: uppercase;
        color: var(--dsw-alias-label-tertiary, #999);
      }
      .dma-head-sub { font-size: 12px; color: var(--dsw-alias-label-secondary, #666); flex: 1; min-width: 180px; }
      .dma-count {
        font-size: 11px; color: var(--dsw-alias-label-tertiary, #999);
        font-variant-numeric: tabular-nums;
      }
      .dma-count.is-full { color: var(--dsw-alias-state-error-primary, #d44); }
      .dma-btn {
        background: none; border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12));
        color: var(--dsw-alias-label-secondary, #666); border-radius: 7px;
        font-size: 11.5px; padding: 3px 9px; cursor: pointer; font-family: inherit;
        white-space: nowrap;
      }
      .dma-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-3, rgba(0,0,0,.05)); }
      .dma-btn:disabled { opacity: .45; cursor: default; }
      .dma-btn.is-primary {
        border-color: var(--dsw-alias-brand-primary, #8b5cf6);
        color: var(--dsw-alias-brand-primary, #8b5cf6);
      }
      .dma-new {
        display: flex; gap: 6px; align-items: center; margin: 0 0 14px;
      }
      .dma-input {
        flex: 1; min-width: 0; font: inherit; font-size: 12.5px;
        padding: 5px 9px; border-radius: 7px;
        border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12));
        background: var(--dsw-alias-bg-layer-1, #fff);
        color: var(--dsw-alias-label-primary, #222);
      }
      .dma-input:focus { outline: 1px solid var(--dsw-alias-brand-primary, #8b5cf6); }

      /* 项目切换条：胶囊，不做卡片墙 —— 项目数 ≤5，一行放得下 */
      .dma-projects { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
      .dma-chip {
        display: flex; flex-direction: column; gap: 1px; align-items: flex-start;
        padding: 6px 11px; border-radius: 9px; cursor: pointer; font-family: inherit;
        background: var(--dsw-alias-bg-layer-1, rgba(0,0,0,.015));
        border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.07));
        color: var(--dsw-alias-label-primary, #222);
      }
      .dma-chip:hover { border-color: var(--dsw-alias-border-l1, rgba(0,0,0,.16)); }
      .dma-chip.is-active {
        border-color: var(--dsw-alias-brand-primary, #8b5cf6);
        background: var(--dsw-alias-bg-layer-3, rgba(139,92,246,.08));
      }
      .dma-chip-name { font-size: 13px; font-weight: 600; }
      .dma-chip.is-active .dma-chip-name { color: var(--dsw-alias-brand-primary, #8b5cf6); }
      .dma-chip-meta {
        font-size: 10.5px; color: var(--dsw-alias-label-tertiary, #999);
        font-variant-numeric: tabular-nums;
      }
      .dma-warn {
        font-size: 11.5px; color: var(--dsw-alias-state-error-primary, #d44);
        margin: 0 0 10px;
      }

      .dma-sec { display: flex; align-items: baseline; gap: 9px; margin: 20px 0 9px; }
      .dma-sec h4 {
        margin: 0; font-size: 11px; letter-spacing: .12em; text-transform: uppercase;
        color: var(--dsw-alias-label-secondary, #666); font-weight: 600;
      }
      .dma-sec .n { font-size: 11px; color: var(--dsw-alias-label-tertiary, #999); font-variant-numeric: tabular-nums; }

      /* 素材网格：方图，缩略图铺满，多余裁切 */
      .dma-grid {
        display: grid; gap: 8px;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      }
      .dma-asset {
        position: relative; aspect-ratio: 1 / 1; border-radius: 9px; overflow: hidden;
        cursor: pointer; background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.03));
        border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.07));
      }
      .dma-asset:hover { border-color: var(--dsw-alias-brand-primary, #8b5cf6); }
      .dma-asset img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .dma-asset-cap {
        position: absolute; left: 0; right: 0; bottom: 0; padding: 10px 6px 4px;
        font-size: 10px; color: #fff; text-align: left;
        background: linear-gradient(transparent, rgba(0,0,0,.72));
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .dma-asset.is-video .dma-asset-cap::before { content: '🎬 '; }

      .dma-job {
        display: flex; gap: 10px; align-items: flex-start; padding: 8px 10px;
        border-radius: 9px; margin-bottom: 4px;
        background: var(--dsw-alias-bg-layer-1, rgba(0,0,0,.015));
        border: 1px solid transparent;
      }
      .dma-job:hover { border-color: var(--dsw-alias-border-l1, rgba(0,0,0,.07)); }
      .dma-job-dot { flex: none; line-height: 1.5; }
      .dma-job-thumb {
        flex: none; width: 44px; height: 44px; border-radius: 7px; overflow: hidden;
        background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.03));
      }
      .dma-job-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .dma-job-body { flex: 1; min-width: 0; }
      .dma-job-prompt {
        margin: 0; color: var(--dsw-alias-label-primary, #222);
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        overflow: hidden; overflow-wrap: anywhere;
      }
      .dma-job-meta {
        display: flex; gap: 9px; align-items: center; margin-top: 3px; flex-wrap: wrap;
        font-size: 11px; color: var(--dsw-alias-label-tertiary, #999);
        font-variant-numeric: tabular-nums;
      }
      .dma-job.is-failed .dma-job-prompt { color: var(--dsw-alias-state-error-primary, #d44); }

      .dma-empty {
        padding: 18px; border-radius: 10px; text-align: center;
        color: var(--dsw-alias-label-tertiary, #999); font-size: 12.5px;
        border: 1px dashed var(--dsw-alias-border-l1, rgba(0,0,0,.1));
      }
      .dma-error {
        padding: 12px 14px; border-radius: 10px; margin-bottom: 12px;
        color: var(--dsw-alias-state-error-primary, #d44); font-size: 12.5px;
        background: var(--dsw-alias-bg-layer-1, rgba(0,0,0,.015));
        border: 1px solid var(--dsw-alias-state-error-primary, rgba(212,68,68,.35));
        overflow-wrap: anywhere;
      }
    `

    function ensureStyle () {
      if (typeof document === 'undefined') return
      if (document.getElementById('dsh-museav-assets-style')) return
      const tag = document.createElement('style')
      tag.id = 'dsh-museav-assets-style'
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    /** 状态点：只区分「成了 / 在跑 / 挂了 / 还没定」，不做四色交通灯。 */
    function statusDot (status) {
      if (status === 'done') return '🟢'
      if (status === 'failed') return '🔴'
      if (status === 'processing' || status === 'pending') return '🟡'
      return '⚪️'
    }

    function AssetsView (props) {
      const t = props.t ?? ((k) => k)
      const [state, setState] = React.useState({
        loading: true, refreshing: false, error: null,
        projects: [], used: 0, limit: 5, full: false,
        project: null, assets: [], assetsError: null, jobs: [],
      })
      const [draft, setDraft] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [toast, setToast] = React.useState(null)

      const load = React.useCallback((manual) => {
        setState((s) => ({ ...s, loading: !manual, refreshing: !!manual }))
        fetch(`${API}/projects`, { headers: { Accept: 'application/json' } })
          .then((r) => r.json())
          .then((data) => {
            if (!data.ok) throw new Error(data.error || t('loadFailed'))
            const saved = localStorage.getItem(STORE_KEY)
            // 选中的项目可能刚被删了 —— 对不上就退回第一个，别停在空视图上。
            const keep = data.projects.find((p) => p.id === saved || p.name === saved)
            const project = keep ?? state.project ?? data.projects[0] ?? null
            setState((s) => ({
              ...s, loading: false, refreshing: false, error: null,
              projects: data.projects, used: data.used, limit: data.limit, full: data.full,
              project,
            }))
            return project
          })
          .then((project) => {
            if (!project) {
              setState((s) => ({ ...s, assets: [], jobs: [], assetsError: null }))
              return
            }
            return Promise.all([
              fetch(`${API}/assets?project=${encodeURIComponent(project.id)}`).then((r) => r.json()),
              fetch(`${API}/jobs?limit=20`).then((r) => r.json()).catch(() => ({ ok: true, jobs: [] })),
            ]).then(([assets, jobs]) => {
              setState((s) => ({
                ...s,
                assets: assets.ok ? assets.assets : [],
                assetsError: assets.ok ? null : (assets.error || t('loadFailed')),
                jobs: jobs.ok ? jobs.jobs : [],
              }))
            })
          })
          .catch((e) => setState((s) => ({ ...s, loading: false, refreshing: false, error: String(e.message || e) })))
      }, [t])

      // 只在挂载时拉一次；用户手动点「刷新」才重跑 —— 不做轮询。
      React.useEffect(() => { load(false) }, [load])

      const pick = (project) => {
        localStorage.setItem(STORE_KEY, project.id)
        setState((s) => ({ ...s, project, assets: [], assetsError: null }))
        Promise.all([
          fetch(`${API}/assets?project=${encodeURIComponent(project.id)}`).then((r) => r.json()),
          fetch(`${API}/jobs?limit=20`).then((r) => r.json()).catch(() => ({ ok: true, jobs: [] })),
        ]).then(([assets, jobs]) => setState((s) => ({
          ...s,
          assets: assets.ok ? assets.assets : [],
          assetsError: assets.ok ? null : (assets.error || t('loadFailed')),
          jobs: jobs.ok ? jobs.jobs : [],
        }))).catch((e) => setState((s) => ({ ...s, assetsError: String(e.message || e) })))
      }

      const create = () => {
        const name = String(draft ?? '').trim()
        if (!name) return
        setBusy(true)
        fetch(`${API}/projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        })
          .then((r) => r.json())
          .then((data) => {
            setBusy(false)
            if (!data.ok) { setToast(data.error || t('loadFailed')); return }
            setDraft(null)
            load(true)
          })
          .catch((e) => { setBusy(false); setToast(String(e.message || e)) })
      }

      const copyAsset = (asset) => {
        navigator.clipboard?.writeText(asset.url)
          .then(() => setToast(t('copied')))
          .catch(() => setToast(asset.url))
      }

      // toast 自己收摊，3 秒够看清
      React.useEffect(() => {
        if (!toast) return
        const timer = setTimeout(() => setToast(null), 3000)
        return () => clearTimeout(timer)
      }, [toast])

      if (state.loading) {
        return h('div', { className: 'dsh-museav-view' }, h('div', { className: 'dma-empty' }, '…'))
      }

      const current = state.project
      return h('div', { className: 'dsh-museav-view' },
        h('div', { className: 'dma-head' },
          h('div', null,
            h('div', { className: 'dma-head-eyebrow' }, '🗂 MUSE AV'),
            h('div', { className: 'dma-head-sub' }, t('subtitle')),
          ),
          h('span', { className: state.full ? 'dma-count is-full' : 'dma-count' },
            t('limit', { used: state.used, limit: state.limit })),
          h('button', {
            className: 'dma-btn', onClick: () => load(true), disabled: state.refreshing,
          }, t('refresh')),
          h('button', {
            className: 'dma-btn is-primary',
            onClick: () => setDraft(''),
            disabled: state.full || busy,
            title: state.full ? t('fullHint', { used: state.used, limit: state.limit }) : '',
          }, t('newProject')),
        ),

        state.error ? h('div', { className: 'dma-error' }, '⚠️ ', state.error, ' — ', t('loginHint')) : null,
        state.full ? h('div', { className: 'dma-warn' }, '⚠️ ', t('fullHint', { used: state.used, limit: state.limit })) : null,
        toast ? h('div', { className: 'dma-warn' }, toast) : null,

        draft !== null
          ? h('div', { className: 'dma-new' },
              h('input', {
                className: 'dma-input', value: draft, autoFocus: true,
                placeholder: t('namePlaceholder'),
                onChange: (e) => setDraft(e.target.value),
                onKeyDown: (e) => { if (e.key === 'Enter') create(); if (e.key === 'Escape') setDraft(null) },
              }),
              h('button', { className: 'dma-btn is-primary', onClick: create, disabled: busy || !String(draft).trim() },
                busy ? t('creating') : t('newProject')),
              h('button', { className: 'dma-btn', onClick: () => setDraft(null) }, '✕'),
            )
          : null,

        h('div', { className: 'dma-projects' },
          state.projects.length === 0
            ? h('div', { className: 'dma-empty' }, t('emptyProjects'))
            : state.projects.map((p) => h('button', {
                className: current && p.id === current.id ? 'dma-chip is-active' : 'dma-chip',
                onClick: () => pick(p),
              },
                h('span', { className: 'dma-chip-name' }, p.name),
                h('span', { className: 'dma-chip-meta' },
                  p.assetCount === null ? '' : t('assetCount', { n: p.assetCount }),
                  p.genTotal ? ` · ${t('genCount', { done: p.genDone, total: p.genTotal })}` : ''),
              )),
        ),

        current && current.brand ? h('div', { className: 'dma-warn' }, t('brand', { brand: current.brand })) : null,

        h('div', { className: 'dma-sec' },
          h('h4', null, '🖼 ', t('assets')),
          h('span', { className: 'n' }, String(state.assets.length)),
        ),
        state.assetsError
          ? h('div', { className: 'dma-error' }, '⚠️ ', state.assetsError)
          : state.assets.length === 0
            ? h('div', { className: 'dma-empty' }, t('emptyAssets'))
            : h('div', { className: 'dma-grid' },
                state.assets.map((a) => h('div', {
                  className: a.mediaType === 'video' ? 'dma-asset is-video' : 'dma-asset',
                  onClick: () => copyAsset(a),
                  title: a.url,
                },
                  a.mediaType === 'video'
                    ? h('div', { className: 'dma-asset-cap' }, a.name)
                    : h('img', { src: a.url, alt: a.name, loading: 'lazy' }),
                  a.mediaType !== 'video' ? h('div', { className: 'dma-asset-cap' }, a.name) : null,
                )),
              ),

        h('div', { className: 'dma-sec' },
          h('h4', null, '🧾 ', t('jobs')),
          h('span', { className: 'n' }, String(state.jobs.length)),
        ),
        state.jobs.length === 0
          ? h('div', { className: 'dma-empty' }, t('emptyJobs'))
          : h('div', null, state.jobs.map((job) => h('div', {
              className: job.status === 'failed' ? 'dma-job is-failed' : 'dma-job',
            },
              h('span', { className: 'dma-job-dot' }, statusDot(job.status)),
              h('div', { className: 'dma-job-thumb' },
                job.url
                  ? h('img', { src: job.url, alt: job.model, loading: 'lazy' })
                  : h('div', { className: 'dma-empty', style: { padding: 0, border: 0 } }, '—')),
              h('div', { className: 'dma-job-body' },
                h('p', { className: 'dma-job-prompt' }, job.error || job.prompt || job.id),
                h('div', { className: 'dma-job-meta' },
                  h('span', null, job.model),
                  job.ratio ? h('span', null, job.ratio) : null,
                  job.elapsedMs ? h('span', null, `${(job.elapsedMs / 1000).toFixed(1)}s`) : null,
                  job.createdAt ? h('span', null, String(job.createdAt).slice(5, 16).replace('T', ' ')) : null,
                  job.workspaceId ? h('span', null, `📁 ${String(job.workspaceId).slice(0, 8)}`) : null,
                ),
              ),
            ))),
      )
    }

    const inject = ['slots', 'locale']

    function apply (ctx) {
      ensureStyle()
      ctx.effect(() => ctx.locale.register(NS, LOCALES), 'dsh-museav-assets: dictionaries')
      const t = ctx.locale.bind(NS)

      // conversation.view 由 ui-conversation 声明，激活顺序不保证 —— 用 slots.inject
      // 等它上账，不假定顺序直接 register。
      ctx.slots.inject('conversation.view', () => ctx.slots.register({
        name: 'conversation.view',
        id: 'museav-assets',
        order: 40,
        label: () => t('title'),
        locale: NS,
        inject: () => ({ t }),
      }, AssetsView))
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
