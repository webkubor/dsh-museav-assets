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
    /**
     * 快照缓存的 key。
     *
     * 为什么必须有：CLI 到中台的链路是**间歇性** `❌ fetch failed`（2026-09-29 实测：
     * 同一分钟里 whoami / jobs 连续失败，直连 API 却是 200，再连打 8 次又全好）。
     * 没有缓存时撞上一次抖动，整面作品墙直接空掉，用户只看到「啥都没有」。
     * 所以策略是 stale-while-revalidate：挂载先用快照把画面铺出来，刷新在后台跑，
     * 失败只在顶上留一条提示，不清空已有内容。
     */
    const CACHE_KEY = 'dsh-museav-assets:cache:v2'

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
        jobsNote: '服务端只返回最近 50 条，且不按项目区分 —— 这里是你账户的全部出图流水。',
        netFail: '读取失败（CLI 到中台的链路会间歇性抽风）',
        keepOld: '下面显示的是上一次拿到的数据。',
        jumpTo: '「{name}」里有 {n} 条 →',
        fullHint: '工作区已满（{used}/{limit}），新建会被服务端拒绝。',
        genCount: '出图 {done}/{total}',
        assetCount: '素材 {n}',
        copied: '已复制素材直链',
        loadFailed: '读取失败',
        loginHint: 'CLI 读不到数据，多半是没登录：终端跑 museav login。',
        limit: '{used}/{limit} 个项目',
        brand: 'brand:{brand}',
        upload: '＋ 传素材',
        uploading: '上传中…',
        tooBig: '文件超过 8MB。更大的视频请回终端跑 museav upload。',
        readFailed: '文件读不出来',
        uploaded: '素材已入库',
        deleted: '素材已删',
        deleteAsset: '删掉这条素材（硬删，不可恢复）',
        confirmDelete: '确认删掉「{name}」？R2 上的文件会一起没了。',
        yes: '删',
        no: '算了',
        templates: '模板',
        tplMine: '我建的',
        tplTenant: '本租户',
        tplPlatform: '平台共享',
        searchTemplate: '搜分类…',
        emptyTemplates: '这一档没有模板。',
        fieldCount: '{n} 字段',
        copyTemplateId: '点一下复制模板 id（museav gen --template <id>）',
        studio: '出图台',
        viaPrompt: '自由提示词模式',
        viaTemplate: '走模板「{name}」',
        promptPlaceholder: '写一句提示词…（⌘/Ctrl + Enter 直接出图）',
        noTemplate: '不用模板（自由提示词）',
        noProject: '不归档',
        generate: '出图',
        generating: '出图中…（20-60 秒）',
        genHint: '提示词 / 垫图 / 归档项目都在这儿定；垫图从下面的素材库点一下就加进来了。',
        needPrompt: '写句提示词，或者选个模板',
        genDone: '出好了，在下面作品墙里',
        genFailed: '出图失败',
        refs: '垫图',
        useAsRef: '点一下当垫图',
        unref: '点一下取消垫图',
        works: '作品集',
        myImages: '我的出图',
        myVideos: '我的视频',
        copyUrl: '复制直链',
        reuse: '用这条提示词再出',
        close: '关闭',
        tplNew: '＋ 新增模板',
        tplName: '模板名',
        tplPrompt: '提示词模板（占位符写 {key}）',
        tplCategory: '分类',
        tplShare: '开放到共享池',
        tplUnshare: '撤回共享',
        tplDelete: '删除模板',
        tplManage: '管理',
        tplSaved: '模板已建',
        tplShared: '已开放到共享池',
        tplUnshared: '已撤回，恢复为仅自己可见',
        tplDeleted: '模板已删',
      },
      en: {
        title: 'Assets',
        subtitle: 'Assets by project. Click an asset to copy its direct URL for use as a ref image (--ref).',
        projects: 'Projects',
        assets: 'Library',
        jobs: 'Recent generations',
        jobsNote: 'The server only returns the latest 50, and it does not split them by project — this is your whole account history.',
        netFail: 'Could not load (the CLI→platform link drops intermittently)',
        keepOld: 'Showing the last data we got.',
        jumpTo: '"{name}" has {n} →',
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
        upload: '＋ Upload asset',
        uploading: 'Uploading…',
        tooBig: 'File is over 8MB. Use museav upload for larger videos.',
        readFailed: 'Could not read the file',
        uploaded: 'Asset added',
        deleted: 'Asset deleted',
        deleteAsset: 'Delete this asset (hard delete, no undo)',
        confirmDelete: 'Delete "{name}"? The file on R2 goes with it.',
        yes: 'Delete',
        no: 'Keep',
        templates: 'Templates',
        tplMine: 'Mine',
        tplTenant: 'This tenant',
        tplPlatform: 'Platform',
        searchTemplate: 'Filter by category…',
        emptyTemplates: 'No templates in this group.',
        fieldCount: '{n} fields',
        copyTemplateId: 'Click to copy the template id (museav gen --template <id>)',
        studio: 'Studio',
        viaPrompt: 'Free-prompt mode',
        viaTemplate: 'Using template "{name}"',
        promptPlaceholder: 'Write a prompt… (⌘/Ctrl + Enter to generate)',
        noTemplate: 'No template (free prompt)',
        noProject: 'No archive',
        generate: 'Generate',
        generating: 'Generating… (20-60s)',
        genHint: 'Prompt, refs and the archive project are set here; click an asset below to add it as a ref.',
        needPrompt: 'Write a prompt or pick a template',
        genDone: 'Done — it is in the wall below',
        genFailed: 'Generation failed',
        refs: 'Refs',
        useAsRef: 'Click to use as a ref image',
        unref: 'Click to remove this ref',
        works: 'Works',
        myImages: 'My images',
        myVideos: 'My videos',
        copyUrl: 'Copy URL',
        reuse: 'Reuse this prompt',
        close: 'Close',
        tplNew: '＋ New template',
        tplName: 'Template name',
        tplPrompt: 'Prompt template (placeholders as {key})',
        tplCategory: 'Category',
        tplShare: 'Share publicly',
        tplUnshare: 'Unshare',
        tplDelete: 'Delete template',
        tplManage: 'Manage',
        tplSaved: 'Template created',
        tplShared: 'Shared to the public pool',
        tplUnshared: 'Unshared — back to private',
        tplDeleted: 'Template deleted',
      },
    }

    const CSS = `
      .dsh-museav-view {
        padding: 16px 20px 168px; font-size: 13px; line-height: 1.6;
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
      .dma-asset.is-ref { border-color: var(--dsw-alias-brand-primary, #8b5cf6); box-shadow: 0 0 0 2px var(--dsw-alias-brand-primary, #8b5cf6) inset; }
      .dma-asset img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .dma-asset-cap {
        position: absolute; left: 0; right: 0; bottom: 0; padding: 10px 6px 4px;
        font-size: 10px; color: #fff; text-align: left;
        background: linear-gradient(transparent, rgba(0,0,0,.72));
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .dma-asset.is-video .dma-asset-cap::before { content: '🎬 '; }
      /* 删除按钮只在 hover / 聚焦时出现：素材是拿去当垫图的，误删的代价不对称 */
      .dma-asset-del {
        position: absolute; top: 4px; right: 4px; z-index: 2;
        width: 20px; height: 20px; border-radius: 6px; cursor: pointer;
        border: 1px solid rgba(255,255,255,.25); background: rgba(0,0,0,.55);
        color: #fff; font-size: 11px; line-height: 1; padding: 0;
        opacity: 0; transition: opacity .12s; font-family: inherit;
      }
      .dma-asset:hover .dma-asset-del, .dma-asset-del:focus-visible { opacity: 1; }
      .dma-asset-del:hover { background: var(--dsw-alias-state-error-primary, #d44); border-color: transparent; }

      /* 模板行：一行一条，归属徽章在右 */
      .dma-tpl {
        display: flex; gap: 10px; align-items: center; padding: 7px 10px;
        border-radius: 9px; margin-bottom: 3px; cursor: pointer;
        background: var(--dsw-alias-bg-layer-1, rgba(0,0,0,.015));
        border: 1px solid transparent;
      }
      .dma-tpl:hover { border-color: var(--dsw-alias-border-l1, rgba(0,0,0,.07)); }
      .dma-tpl { display: flex; gap: 8px; align-items: center; }
      .dma-tpl-main {
        flex: 1; min-width: 0; display: flex; gap: 10px; align-items: center;
        background: none; border: none; padding: 0; cursor: pointer; font-family: inherit; text-align: left;
      }
      .dma-tpl-acts { display: flex; gap: 6px; flex: none; opacity: 0; transition: opacity .12s; }
      .dma-tpl:hover .dma-tpl-acts, .dma-tpl-acts:focus-within { opacity: 1; }
      .dma-tpl-form {
        display: flex; flex-direction: column; gap: 7px; padding: 11px 12px; margin-bottom: 10px;
        border-radius: 10px; background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.02));
        border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.07));
      }
      .dma-tpl-name {
        flex: 1; min-width: 0; color: var(--dsw-alias-label-primary, #222);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .dma-tpl-meta {
        display: flex; gap: 8px; align-items: center; flex: none;
        font-size: 11px; color: var(--dsw-alias-label-tertiary, #999);
        font-variant-numeric: tabular-nums;
      }
      .dma-badge {
        font-size: 10px; padding: 0 5px; border-radius: 4px;
        border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.1));
        color: var(--dsw-alias-label-secondary, #666);
      }
      .dma-badge.is-mine {
        border-color: var(--dsw-alias-brand-primary, #8b5cf6);
        color: var(--dsw-alias-brand-primary, #8b5cf6);
      }

      .dma-job {
        display: flex; gap: 10px; align-items: flex-start; padding: 8px 10px;
        border-radius: 9px; margin-bottom: 4px;
        background: var(--dsw-alias-bg-layer-1, rgba(0,0,0,.015));
        border: 1px solid transparent;
      }
      .dma-job:hover { border-color: var(--dsw-alias-border-l1, rgba(0,0,0,.07)); }
      .dma-job-dot { flex: none; line-height: 1.5; }
      .dma-job-thumb {
        flex: none; width: 52px; height: 52px; border-radius: 8px; overflow: hidden;
        background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.03));
        display: flex; align-items: center; justify-content: center;
      }
      .dma-job-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
      /* 失败任务没有产物可画 —— 画个虚线框，别留一个看着像「加载失败」的空白块 */
      .dma-job-thumb.is-none {
        border: 1px dashed var(--dsw-alias-border-l1, rgba(0,0,0,.14));
        color: var(--dsw-alias-label-tertiary, #999); font-size: 13px;
      }
      .dma-note { font-size: 11px; color: var(--dsw-alias-label-tertiary, #999); margin: 0 0 8px; }

      /* ── 出图台：这个 tab 的主功能，视觉上要压得住其余所有段 ── */
      .dma-studio {
        padding: 13px 14px 12px; border-radius: 12px; margin: 14px 0 4px;
        background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.02));
        border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.07));
      }
      .dma-studio-head { display: flex; gap: 9px; align-items: baseline; margin-bottom: 9px; }
      .dma-studio-title { font-size: 13px; font-weight: 650; color: var(--dsw-alias-label-primary, #222); }
      .dma-studio-note { font-size: 11px; color: var(--dsw-alias-label-tertiary, #999); }
      .dma-prompt {
        width: 100%; box-sizing: border-box; resize: vertical; font: inherit; font-size: 13px;
        line-height: 1.6; padding: 8px 10px; border-radius: 9px;
        border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12));
        background: var(--dsw-alias-bg-layer-1, #fff);
        color: var(--dsw-alias-label-primary, #222);
      }
      .dma-prompt:focus { outline: 1px solid var(--dsw-alias-brand-primary, #8b5cf6); }
      .dma-controls { display: flex; gap: 8px; align-items: center; margin-top: 9px; flex-wrap: wrap; }
      .dma-select {
        font: inherit; font-size: 12px; padding: 4px 8px; border-radius: 7px; max-width: 220px;
        border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12));
        background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #222);
      }
      .dma-archive {
        font-size: 11.5px; color: var(--dsw-alias-label-secondary, #666);
        padding: 3px 8px; border-radius: 7px;
        border: 1px dashed var(--dsw-alias-border-l1, rgba(0,0,0,.14));
      }
      .dma-gen {
        font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer;
        padding: 5px 16px; border-radius: 8px; border: 1px solid transparent;
        background: var(--dsw-alias-brand-primary, #8b5cf6); color: #fff;
      }
      .dma-gen:disabled { opacity: .45; cursor: default; }
      .dma-hint { font-size: 10.5px; color: var(--dsw-alias-label-tertiary, #999); margin-top: 7px; }
      .dma-fields {
        display: grid; gap: 7px; margin-bottom: 9px;
        grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
      }
      .dma-field { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .dma-field > span { font-size: 10.5px; color: var(--dsw-alias-label-tertiary, #999); }
      .dma-refs { display: flex; gap: 7px; align-items: center; margin-top: 9px; flex-wrap: wrap; }
      .dma-refs-label { font-size: 11px; color: var(--dsw-alias-label-tertiary, #999); }
      .dma-ref {
        position: relative; width: 40px; height: 40px; border-radius: 7px; overflow: hidden;
        border: 1px solid var(--dsw-alias-brand-primary, #8b5cf6);
      }
      .dma-ref img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .dma-ref .dma-asset-del { opacity: 1; width: 15px; height: 15px; font-size: 9px; }

      .dma-sub {
        display: flex; gap: 8px; align-items: baseline;
        margin: 14px 0 8px; font-size: 12px; font-weight: 600;
        color: var(--dsw-alias-label-secondary, #666);
      }
      .dma-sub .n { font-size: 11px; color: var(--dsw-alias-label-tertiary, #999); font-weight: 400; }
      /* ── 作品集：这是「看图」的地方，图片本身是主角 ── */
      .dma-wall {
        display: grid; gap: 8px;
        grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
      }
      .dma-work {
        position: relative; aspect-ratio: 1 / 1; border-radius: 10px; overflow: hidden;
        cursor: zoom-in; padding: 0; font-family: inherit; background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.03));
        border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.07));
      }
      .dma-work:hover { border-color: var(--dsw-alias-brand-primary, #8b5cf6); }
      .dma-work img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .dma-work-cap {
        position: absolute; left: 0; right: 0; bottom: 0; padding: 16px 7px 5px;
        display: flex; gap: 5px; align-items: flex-end;
        background: linear-gradient(transparent, rgba(0,0,0,.78));
        text-align: left;
      }
      .dma-work-dot { flex: none; font-size: 9px; line-height: 1.3; }
      .dma-work-prompt {
        font-size: 10.5px; color: #fff; line-height: 1.35;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
      }
      .dma-work-video {
        position: absolute; inset: 0; display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 2px;
        font-size: 22px; color: var(--dsw-alias-label-tertiary, #999);
      }
      .dma-work-video > span { font-size: 9px; letter-spacing: .08em; }
      .dma-work.is-video { cursor: pointer; }

      /* ── 放大层 ── */
      .dma-zoom {
        position: fixed; inset: 0; z-index: 90; display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,.72); padding: 32px; box-sizing: border-box;
      }
      .dma-zoom-box {
        max-width: min(1000px, 92vw); max-height: 92vh; display: flex; flex-direction: column; gap: 10px;
        background: var(--dsw-alias-bg-layer-1, #111); border-radius: 12px; padding: 12px;
      }
      .dma-zoom-box img {
        max-width: 100%; max-height: 70vh; object-fit: contain; display: block; border-radius: 8px;
      }
      .dma-zoom-meta { min-width: 0; }
      .dma-zoom-prompt {
        margin: 0 0 6px; font-size: 12.5px; color: var(--dsw-alias-label-primary, #222);
        max-height: 5.4em; overflow: auto; line-height: 1.5;
      }
      .dma-zoom-actions { display: flex; gap: 8px; margin-top: 8px; }
      /* 空态里的「去有素材的项目看看」 */
      .dma-jump {
        display: inline-block; margin-top: 9px; cursor: pointer; font-family: inherit;
        background: none; border: 1px solid var(--dsw-alias-brand-primary, #8b5cf6);
        color: var(--dsw-alias-brand-primary, #8b5cf6); border-radius: 7px;
        font-size: 11.5px; padding: 3px 10px;
      }
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

    /** 写快照。只存纯数据（不存 React 状态），读的时候再补齐缺省字段。 */
    function readCache () {
      try {
        const raw = localStorage.getItem(CACHE_KEY)
        if (!raw) return null
        const data = JSON.parse(raw)
        if (!data || typeof data !== 'object' || !Array.isArray(data.jobs)) return null
        return data
      } catch {
        return null
      }
    }

    function writeCache (data) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data))
      } catch {
        // 配额满 / 隐私模式：缓存不是功能，存不下就算了
      }
    }

    function ensureStyle () {
      if (typeof document === 'undefined') return
      if (document.getElementById('dsh-museav-assets-style')) return
      const tag = document.createElement('style')
      tag.id = 'dsh-museav-assets-style'
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    /**
     * 首次打开（或上次选的项目没了）落在**素材最多**的那个项目上。
     *
     * 为什么不是列表第一个：这个 tab 是来看资产的，开在一个 0 素材的项目上，
     * 用户看到的就是「啥都没有」—— 2026-09-29 真机就是这个效果：4 个项目里
     * 第一个是空的，唯一有 1 张素材的排在第 4 个。素材数相同时比出图量，
     * 都一样就取第一个，保证结果稳定不跳。
     */
    function richestProject (projects) {
      const list = [...projects]
      list.sort((a, b) =>
        (b.assetCount ?? 0) - (a.assetCount ?? 0) ||
        (b.genDone ?? 0) - (a.genDone ?? 0))
      return list[0] ?? null
    }

    /**
     * 出图台。
     *
     * 这一版的排布逻辑：**出图在最上面，作品在中间，素材垫图在下面**。
     * 上一版是「项目 / 素材 / 模板 / 出图流水」四段报表，模板被 50 条流水压到屏幕外，
     * 而它其实是出图的入口。现在模板折进出图表单里当选择器，流水换成作品墙。
     */
    function AssetsView (props) {
      const t = props.t ?? ((k) => k)
      // 挂载时先铺缓存：loading 直接为 false，画面立刻有东西；随后后台刷新。
      const [state, setState] = React.useState(() => {
        const cached = typeof localStorage !== 'undefined' ? readCache() : null
        if (!cached) {
          return {
            loading: true, refreshing: false, error: null, stale: false,
            projects: [], used: 0, limit: 5, full: false,
            project: null, assets: [], assetsError: null, jobs: [],
            templates: [], templatesError: null,
          }
        }
        return {
          ...cached,
          loading: false, refreshing: true, error: null,
          // 缓存里的 project 可能已经不在了，挂载后由 load() 校正
          stale: true,
        }
      })
      const [form, setForm] = React.useState({
        prompt: '', ratio: '3:4', templateId: '', fields: {}, refs: [],
      })
      const [running, setRunning] = React.useState(false)
      const [toast, setToast] = React.useState(null)
      const [draft, setDraft] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [uploading, setUploading] = React.useState(false)
      const [pendingDelete, setPendingDelete] = React.useState(null)
      const [zoom, setZoom] = React.useState(null)
      const [tplForm, setTplForm] = React.useState(null)
      const [tplBusy, setTplBusy] = React.useState(false)
      const [tplSource, setTplSource] = React.useState('mine')
      const fileRef = React.useRef(null)

      const patch = (next) => setState((s) => ({ ...s, ...next }))

      const loadProjectData = React.useCallback((project) => {
        if (!project) {
          patch({ assets: [], jobs: [], assetsError: null })
          return
        }
        return Promise.all([
          fetch(`${API}/assets?project=${encodeURIComponent(project.id)}`).then((r) => r.json()),
          fetch(`${API}/jobs?limit=50`).then((r) => r.json()).catch(() => ({ ok: false, error: t('netFail') })),
        ]).then(([assets, jobs]) => {
          setState((s) => {
            // 只有**成功**才覆盖。撞上 fetch failed 时保留旧画面 + 顶上给一条提示 ——
            // 清空等于把用户刚看到的东西抹掉，比"数据旧了 10 分钟"糟糕得多。
            const next = {
              ...s,
              assets: assets.ok ? assets.assets : s.assets,
              assetsError: assets.ok ? null : (assets.error || t('loadFailed')),
              jobs: jobs.ok ? jobs.jobs : s.jobs,
              jobsError: jobs.ok ? null : (jobs.error || t('loadFailed')),
              stale: false,
            }
            writeCache({
              projects: next.projects, used: next.used, limit: next.limit, full: next.full,
              project: next.project, assets: next.assets, jobs: next.jobs,
              templates: next.templates, savedAt: Date.now(),
            })
            return next
          })
        })
      }, [t])

      const loadTemplates = React.useCallback((source) => {
        setTplSource(source)
        return fetch(`${API}/templates?source=${source}`, { headers: { Accept: 'application/json' } })
          .then((r) => r.json())
          .then((data) => patch({
            templates: data.ok ? data.templates : [],
            templatesError: data.ok ? null : (data.error || t('loadFailed')),
          }))
          .catch((e) => patch({ templatesError: String(e.message || e) }))
      }, [t])

      const load = React.useCallback((manual) => {
        setState((s) => ({ ...s, loading: !manual, refreshing: !!manual }))
        return fetch(`${API}/projects`, { headers: { Accept: 'application/json' } })
          .then((r) => r.json())
          .then((data) => {
            if (!data.ok) throw new Error(data.error || t('loadFailed'))
            const saved = localStorage.getItem(STORE_KEY)
            // 选中的项目可能刚被删了 —— 对不上就重挑一个，别停在空视图上。
            const keep = data.projects.find((p) => p.id === saved || p.name === saved)
            const project = keep ?? richestProject(data.projects)
            setState((s) => ({
              ...s, loading: false, refreshing: false, error: null,
              projects: data.projects, used: data.used, limit: data.limit, full: data.full,
              project,
            }))
            return project
          })
          .then((project) => loadProjectData(project))
          .catch((e) => setState((s) => ({ ...s, loading: false, refreshing: false, error: String(e.message || e) })))
      }, [t, loadProjectData])

      // 挂载时拉一次；点「🔄」才重跑 —— 不轮询，生成中另走 /gen 的同步回执。
      React.useEffect(() => {
        load(false)
        loadTemplates('mine')
      }, [load, loadTemplates])

      const pick = (project) => {
        localStorage.setItem(STORE_KEY, project.id)
        patch({ project, assets: [], assetsError: null })
        loadProjectData(project).catch((e) => patch({ assetsError: String(e.message || e) }))
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

      const copy = (text, message) => {
        navigator.clipboard?.writeText(text)
          .then(() => setToast(message ?? t('copied')))
          .catch(() => setToast(text))
      }

      /** 出图：CLI 同步跑完（20~60s），回执直接进作品墙。 */
      const generate = () => {
        if (running) return
        if (!form.prompt.trim() && !form.templateId) { setToast(t('needPrompt')); return }
        setRunning(true)
        const body = {
          prompt: form.prompt.trim(),
          ratio: form.ratio,
          project: state.project?.id ?? '',
          refs: form.refs,
        }
        if (form.templateId) {
          body.templateId = form.templateId
          body.fields = form.fields
        }
        fetch(`${API}/gen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
          .then((r) => r.json())
          .then((res) => {
            setRunning(false)
            if (!res.ok) { setToast(res.error || t('genFailed')); return }
            setToast(t('genDone'))
            // 立刻刷新：服务端那边已经落库了
            loadProjectData(state.project)
          })
          .catch((e) => { setRunning(false); setToast(String(e.message || e)) })
      }

      /** 模板的一个动作：新建 / 分享 / 撤回 / 删除。CLI 子命令一一对应。 */
      const tplAction = (body) => {
        setTplBusy(true)
        return fetch(`${API}/templates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
          .then((r) => r.json())
          .then((res) => {
            setTplBusy(false)
            if (!res.ok) { setToast(res.error || t('loadFailed')); return res }
            if (body.action === 'create') { setTplForm(null); setToast(t('tplSaved')) }
            else if (body.action === 'share') setToast(t('tplShared'))
            else if (body.action === 'unshare') setToast(t('tplUnshared'))
            else if (body.action === 'delete') setToast(t('tplDeleted'))
            loadTemplates(tplSource)
            return res
          })
          .catch((e) => { setTplBusy(false); setToast(String(e.message || e)); return { ok: false } })
      }

      const upload = (file) => {
        if (!file || !state.project) return
        if (file.size > 8 * 1024 * 1024) { setToast(t('tooBig')); return }
        setUploading(true)
        const reader = new FileReader()
        reader.onerror = () => { setUploading(false); setToast(t('readFailed')) }
        reader.onload = () => {
          const data = String(reader.result ?? '').split(',')[1] ?? ''
          fetch(`${API}/assets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project: state.project.id, filename: file.name, data }),
          })
            .then((r) => r.json())
            .then((res) => {
              setUploading(false)
              if (!res.ok) { setToast(res.error || t('loadFailed')); return }
              setToast(t('uploaded'))
              loadProjectData(state.project)
            })
            .catch((e) => { setUploading(false); setToast(String(e.message || e)) })
        }
        reader.readAsDataURL(file)
      }

      const doDelete = (asset) => {
        setPendingDelete(null)
        fetch(`${API}/assets?id=${encodeURIComponent(asset.id)}`, { method: 'DELETE' })
          .then((r) => r.json())
          .then((res) => {
            if (!res.ok) { setToast(res.error || t('loadFailed')); return }
            setToast(t('deleted'))
            loadProjectData(state.project)
          })
          .catch((e) => setToast(String(e.message || e)))
      }

      // toast 自己收摊，3 秒够看清
      React.useEffect(() => {
        if (!toast) return
        const timer = setTimeout(() => setToast(null), 3200)
        return () => clearTimeout(timer)
      }, [toast])

      if (state.loading) {
        return h('div', { className: 'dsh-museav-view' }, h('div', { className: 'dma-empty' }, '…'))
      }

      const current = state.project
      const template = state.templates.find((x) => x.id === form.templateId) ?? null
      // 当前项目空着的时候，「哪个项目还有素材」先算好一次
      const elsewhere = current ? richestProject(state.projects.filter((p) => p.id !== current.id)) : null
      const jumpTarget = elsewhere?.assetCount ? elsewhere : null
      /**
       * 作品集 = 只放**出的成的**，且图片和视频分家。
       *
       * 三条口径（owner 2026-09-29）：
       *   · 报错记录不是作品 —— 资源库里出现「我又没查」的错误记录是噪声，直接不进墙。
       *     真实数据里 50 条有 11 条 failed，之前铺在墙上占了 22% 的格子、满屏红字。
       *   · 图片就是图片、视频就是视频，不能混在一面网格里 —— 视频 cdn_url 是 .mp4，
       *     塞进 <img> 就是破图（真机 5 格全是破的）。
       *   · media_type 还有第三类：reverse（读图逆向的记录，2 条，cdn_url 是被读的
       *     那张原图）。它不是作品，也不该进作品集。
       * 失败条数在标题旁用一行小字交代，不藏也不占位。
       */
      const doneJobs = state.jobs.filter((j) => j.status === 'done')
      const imageWorks = doneJobs.filter((j) => j.mediaType === 'image')
      const videoWorks = doneJobs.filter((j) => j.mediaType === 'video')
      const refAssets = form.refs
        .map((url) => state.assets.find((a) => a.url === url))
        .filter(Boolean)

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
        ),

        state.error ? h('div', { className: 'dma-error' }, '⚠️ ', state.error, ' — ', t('loginHint')) : null,
        toast ? h('div', { className: 'dma-warn' }, toast) : null,
        pendingDelete
          ? h('div', { className: 'dma-error' },
              '⚠️ ', t('confirmDelete', { name: pendingDelete.name || pendingDelete.id }), ' ',
              h('button', { className: 'dma-btn is-primary', onClick: () => doDelete(pendingDelete) }, t('yes')),
              ' ',
              h('button', { className: 'dma-btn', onClick: () => setPendingDelete(null) }, t('no')))
          : null,

        h('div', { className: 'dma-projects' },
          state.projects.map((p) => h('button', {
              className: current && p.id === current.id ? 'dma-chip is-active' : 'dma-chip',
              onClick: () => pick(p),
            },
              h('span', { className: 'dma-chip-name' }, p.name),
              h('span', { className: 'dma-chip-meta' },
                p.assetCount === null ? '' : t('assetCount', { n: p.assetCount }),
                p.genTotal ? ` · ${t('genCount', { done: p.genDone, total: p.genTotal })}` : ''),
            )),
          h('button', {
            className: 'dma-btn is-primary', onClick: () => setDraft(''),
            disabled: state.full || busy, title: state.full ? t('fullHint', { used: state.used, limit: state.limit }) : '',
          }, t('newProject')),
        ),

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
              h('button', { className: 'dma-btn', onClick: () => setDraft(null) }, '✕'))
          : null,

        // ── 出图台 ──
        h('div', { className: 'dma-studio' },
          h('div', { className: 'dma-studio-head' },
            h('span', { className: 'dma-studio-title' }, '🎨 ', t('studio')),
            h('span', { className: 'dma-studio-note' },
              running ? t('generating') : (template ? t('viaTemplate', { name: template.name }) : t('viaPrompt'))),
          ),
          template
            ? h('div', { className: 'dma-fields' },
                (template.fields ?? []).map((key) => h('label', { className: 'dma-field', key },
                  h('span', null, key),
                  h('input', {
                    className: 'dma-input',
                    value: form.fields[key] ?? '',
                    onChange: (e) => setForm((f) => ({ ...f, fields: { ...f.fields, [key]: e.target.value } })),
                  }),
                )))
            : null,
          h('textarea', {
            className: 'dma-prompt',
            rows: 3,
            value: form.prompt,
            placeholder: t('promptPlaceholder'),
            onChange: (e) => setForm((f) => ({ ...f, prompt: e.target.value })),
            onKeyDown: (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate() },
          }),
          h('div', { className: 'dma-controls' },
            h('select', {
              className: 'dma-select',
              value: form.templateId,
              onChange: (e) => setForm((f) => ({ ...f, templateId: e.target.value, fields: {} })),
            },
              h('option', { value: '' }, t('noTemplate')),
              state.templates.map((tpl) => h('option', { value: tpl.id }, `${tpl.name}${tpl.ratio ? ` · ${tpl.ratio}` : ''}`)),
            ),
            h('select', {
              className: 'dma-select',
              value: form.ratio,
              onChange: (e) => setForm((f) => ({ ...f, ratio: e.target.value })),
            }, ['3:4', '9:16', '1:1', '4:3', '16:9'].map((r) => h('option', { value: r }, r))),
            h('span', { className: 'dma-archive' }, '📁 ', current ? current.name : t('noProject')),
            h('span', { style: { flex: 1 } }),
            h('button', {
              className: 'dma-gen',
              onClick: generate,
              disabled: running || (!form.prompt.trim() && !form.templateId),
            }, running ? t('generating') : '🎨 ', t('generate')),
          ),
          h('div', { className: 'dma-hint' }, t('genHint')),
          refAssets.length
            ? h('div', { className: 'dma-refs' },
                h('span', { className: 'dma-refs-label' }, t('refs')),
                refAssets.map((a) => h('div', { className: 'dma-ref' },
                  h('img', { src: a.url, alt: a.name }),
                  h('button', {
                    className: 'dma-asset-del',
                    onClick: () => setForm((f) => ({ ...f, refs: f.refs.filter((u) => u !== a.url) })),
                  }, '✕'))))
            : null,
        ),

        // ── 作品集：出的成的才进来；图片与视频分家 ──
        h('div', { className: 'dma-sec' },
          h('h4', null, '🖼 ', t('works')),
          h('span', { className: 'n' }, String(imageWorks.length + videoWorks.length)),
          h('span', { style: { flex: 1 } }),
          h('button', { className: 'dma-btn', onClick: () => loadProjectData(current) }, t('refresh')),
        ),
        h('p', { className: 'dma-note' }, t('jobsNote')),
        state.jobsError
          ? h('div', { className: 'dma-warn' }, '⚠️ ', state.jobsError, ' ', t('keepOld'))
          : null,

        imageWorks.length
          ? h('div', null,
              h('div', { className: 'dma-sub' }, '🖼 ', t('myImages'), h('span', { className: 'n' }, String(imageWorks.length))),
              h('div', { className: 'dma-wall' }, imageWorks.map((job, i) => h('button', {
                  className: 'dma-work',
                  onClick: () => setZoom(job),
                  title: job.prompt || job.id,
                },
                  h('img', { src: job.url, alt: job.model, loading: i < 12 ? 'eager' : 'lazy' }),
                  h('span', { className: 'dma-work-cap' },
                    h('span', { className: 'dma-work-prompt' }, job.prompt || job.id)),
                ))))
          : null,

        videoWorks.length
          ? h('div', null,
              h('div', { className: 'dma-sub' }, '🎬 ', t('myVideos'), h('span', { className: 'n' }, String(videoWorks.length))),
              h('div', { className: 'dma-wall' }, videoWorks.map((job) => h('button', {
                  className: 'dma-work is-video', onClick: () => setZoom(job),
                  title: job.prompt || job.id,
                },
                  // 视频的 cdn_url 是 .mp4，塞进 <img> 就是破图（真机 5 格全破）。
                  // 缩略位放 ▶ 徽章，真播放在放大层里用 <video controls>。
                  h('span', { className: 'dma-work-video' }, '▶', h('span', null, job.model || 'MP4')),
                  h('span', { className: 'dma-work-cap' },
                    h('span', { className: 'dma-work-prompt' }, job.prompt || job.id)),
                ))))
          : null,

        imageWorks.length + videoWorks.length === 0
          ? h('div', { className: 'dma-empty' }, t('emptyJobs'))
          : null,

        // ── 素材库（垫图来源）──
        h('div', { className: 'dma-sec' },
          h('h4', null, '🧱 ', t('assets')),
          h('span', { className: 'n' }, String(state.assets.length)),
          h('span', { style: { flex: 1 } }),
          h('input', {
            type: 'file', ref: fileRef, style: { display: 'none' },
            accept: 'image/*,audio/*,video/*',
            onChange: (e) => { upload(e.target.files?.[0]); e.target.value = '' },
          }),
          h('button', {
            className: 'dma-btn', disabled: uploading || !current,
            onClick: () => fileRef.current?.click(),
          }, uploading ? t('uploading') : t('upload')),
        ),
        state.assetsError
          ? h('div', { className: 'dma-error' }, '⚠️ ', state.assetsError)
          : state.assets.length === 0
            ? h('div', { className: 'dma-empty' },
                t('emptyAssets'),
                jumpTarget
                  ? h('div', null, h('button', {
                      className: 'dma-jump', onClick: () => pick(jumpTarget),
                    }, t('jumpTo', { name: jumpTarget.name, n: jumpTarget.assetCount })))
                  : null,
                h('div', { style: { marginTop: '9px' } },
                  h('button', { className: 'dma-jump', onClick: () => fileRef.current?.click() }, t('upload'))))
            : h('div', { className: 'dma-grid' },
                state.assets.map((a) => {
                  const on = form.refs.includes(a.url)
                  return h('div', {
                    className: `${a.mediaType === 'video' ? 'dma-asset is-video' : 'dma-asset'}${on ? ' is-ref' : ''}`,
                    onClick: () => setForm((f) => ({
                      ...f,
                      refs: on ? f.refs.filter((u) => u !== a.url) : [...f.refs, a.url].slice(0, 5),
                    })),
                    title: on ? t('unref') : t('useAsRef'),
                  },
                    h('button', {
                      className: 'dma-asset-del',
                      title: t('deleteAsset'),
                      onClick: (e) => { e.stopPropagation(); setPendingDelete(a) },
                    }, '🗑'),
                    a.mediaType === 'video'
                      ? h('div', { className: 'dma-asset-cap' }, a.name)
                      : h('img', { src: a.url, alt: a.name, loading: 'lazy' }),
                    a.mediaType !== 'video' ? h('div', { className: 'dma-asset-cap' }, a.name) : null,
                  )
                })),

        // ── 模板管理：浏览 / 新增 / 分享 / 撤回 / 删除 ──
        h('div', { className: 'dma-sec' },
          h('h4', null, '🧩 ', t('templates')),
          h('span', { className: 'n' }, String(state.templates.length)),
          h('span', { style: { flex: 1 } }),
          h('button', {
            className: 'dma-btn is-primary', disabled: tplBusy,
            onClick: () => setTplForm({ name: '', prompt: '', category: '', ratio: '3:4' }),
          }, t('tplNew')),
        ),
        h('div', { className: 'dma-projects', style: { marginBottom: '10px' } },
          [['mine', t('tplMine')], ['tenant', t('tplTenant')], ['platform', t('tplPlatform')]].map(([key, label]) =>
            h('button', {
              className: tplSource === key ? 'dma-chip is-active' : 'dma-chip',
              onClick: () => loadTemplates(key),
            }, h('span', { className: 'dma-chip-name' }, label))),
        ),
        tplForm
          ? h('div', { className: 'dma-tpl-form' },
              h('input', {
                className: 'dma-input', value: tplForm.name, placeholder: t('tplName'), autoFocus: true,
                onChange: (e) => setTplForm((f) => ({ ...f, name: e.target.value })),
              }),
              h('textarea', {
                className: 'dma-prompt', rows: 2, value: tplForm.prompt, placeholder: t('tplPrompt'),
                onChange: (e) => setTplForm((f) => ({ ...f, prompt: e.target.value })),
              }),
              h('div', { className: 'dma-controls' },
                h('input', {
                  className: 'dma-input', style: { width: 150 }, value: tplForm.category,
                  placeholder: t('tplCategory'),
                  onChange: (e) => setTplForm((f) => ({ ...f, category: e.target.value })),
                }),
                h('select', {
                  className: 'dma-select',
                  value: tplForm.ratio,
                  onChange: (e) => setTplForm((f) => ({ ...f, ratio: e.target.value })),
                }, ['3:4', '9:16', '1:1', '4:3', '16:9'].map((r) => h('option', { value: r }, r))),
                h('span', { style: { flex: 1 } }),
                h('button', {
                  className: 'dma-gen', disabled: tplBusy || !tplForm.name.trim() || !tplForm.prompt.trim(),
                  onClick: () => tplAction({ action: 'create', ...tplForm }),
                }, t('tplNew')),
                h('button', { className: 'dma-btn', onClick: () => setTplForm(null) }, '✕')))
          : null,
        state.templatesError
          ? h('div', { className: 'dma-error' }, '⚠️ ', state.templatesError)
          : state.templates.length === 0
            ? h('div', { className: 'dma-empty' }, t('emptyTemplates'))
            : h('div', null, state.templates.map((tpl) => h('div', { className: 'dma-tpl' },
                h('button', {
                  className: 'dma-tpl-main', title: t('copyTemplateId'),
                  onClick: () => {
                    copy(tpl.id)
                    setForm((f) => ({ ...f, templateId: tpl.id, fields: {}, ratio: tpl.ratio || f.ratio }))
                    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
                  },
                },
                  h('span', { className: 'dma-tpl-name' }, tpl.name),
                  h('span', { className: 'dma-tpl-meta' },
                    tpl.ratio ? h('span', null, tpl.ratio) : null,
                    tpl.fieldCount ? h('span', null, t('fieldCount', { n: tpl.fieldCount })) : null,
                    h('span', { className: tpl.source === '个人' ? 'dma-badge is-mine' : 'dma-badge' }, tpl.source ?? '—'))),
                tpl.source !== '平台'
                  ? h('div', { className: 'dma-tpl-acts' },
                      h('button', {
                        className: 'dma-btn', title: tpl.source === '租户' ? t('tplUnshare') : t('tplShare'),
                        disabled: tplBusy,
                        onClick: () => tplAction({ action: tpl.source === '租户' ? 'unshare' : 'share', id: tpl.id }),
                      }, tpl.source === '租户' ? '🔒' : '🌐'),
                      h('button', {
                        className: 'dma-btn', title: t('tplDelete'), disabled: tplBusy,
                        onClick: () => tplAction({ action: 'delete', id: tpl.id }),
                      }, '🗑'))
                  : null,
              ))),

        zoom
          ? h('div', { className: 'dma-zoom', onClick: () => setZoom(null) },
              h('div', { className: 'dma-zoom-box', onClick: (e) => e.stopPropagation() },
                zoom.mediaType === 'video'
                  ? h('video', { src: zoom.url, controls: true, style: { maxWidth: '100%', maxHeight: '70vh' } })
                  : h('img', { src: zoom.url, alt: zoom.model }),
                h('div', { className: 'dma-zoom-meta' },
                  h('p', { className: 'dma-zoom-prompt' }, zoom.prompt || zoom.id),
                  h('div', { className: 'dma-job-meta' },
                    h('span', null, zoom.model),
                    zoom.ratio ? h('span', null, zoom.ratio) : null,
                    zoom.createdAt ? h('span', null, String(zoom.createdAt).slice(5, 16).replace('T', ' ')) : null,
                  ),
                  h('div', { className: 'dma-zoom-actions' },
                    h('button', { className: 'dma-btn', onClick: () => copy(zoom.url) }, t('copyUrl')),
                    h('button', {
                      className: 'dma-btn is-primary',
                      onClick: () => { setForm((f) => ({ ...f, prompt: zoom.prompt || '' })); setZoom(null) },
                    }, t('reuse')),
                    h('button', { className: 'dma-btn', onClick: () => setZoom(null) }, t('close')),
                  ))))
          : null,
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
    // 测试缝：默认选项目的那段逻辑跑在 fetch 回调里，mock React 驱动不到，
    // 单独挂出来让 test/client-ui.test.mjs 直接断言。
    exports.richestProject = richestProject
    exports.inject = inject
    return module.exports
  },
})
