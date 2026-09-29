/**
 * CLI 输出契约测试 —— 拿真机抓到的 museav 3.9.1 输出当夹具。
 *
 * 这组测试守的是整个插件最脆的一环：插件解析的是**别人写的 CLI 的 stdout/stderr**。
 * museav-cli 改一句中文，这里就该红 —— 红了才知道该改解析器，而不是等到用户
 * 打开 tab 看见一片空白。
 *
 * 夹具来源：`museav projects` / `museav projects assets --project IP账户运营` /
 * `museav jobs --limit 1` 的真实 stdout 与 stderr（2026-09-29 抓取）。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  parseProjectIds,
  parseProjectTable,
  mergeProjects,
  parseAssetTsv,
  parseAssetTable,
  mergeAssets,
  parseJobArray,
  summarizeJobs,
} from '../lib/museav.js'

const PROJECTS_STDOUT = `6f250169-b42e-498b-a898-09efdc1441bb
6babf21d-7a93-4bd5-94bb-0a46e001a416
49a023a7-f3b0-4685-b4a4-fb0131df13e9
2282ad52-b0e9-4c52-bcf1-339c8a43adad
`

const PROJECTS_STDERR = `工作区（4 个）:
  6f250169-b42e-498b-a898-09efdc1441bb  默认项目             出图 39/43  素材 0
  6babf21d-7a93-4bd5-94bb-0a46e001a416  巴基斯坦站点群          出图 33/34  素材 0
  49a023a7-f3b0-4685-b4a4-fb0131df13e9  默认项目             出图 25/25  素材 0  brand:brandcheck
  2282ad52-b0e9-4c52-bcf1-339c8a43adad  IP账户运营           出图 12/13  素材 1

素材库: museav projects assets --project <id|名>
出图归档: museav gen --project <id|名> ...
`

const ASSETS_STDOUT =
  '630b8428-394f-472a-ad27-036dce46e9c7\thttps://img.webkubor.online/refs/45d47835-cde2-4022-bd4d-5bc729ff8f1f/2282ad52-b0e9-4c52-bcf1-339c8a43adad/fa4af95b-323.png\n'

const ASSETS_STDERR = `「IP账户运营」素材库（1 条）:
  630b8428-394f-472a-ad27-036dce46e9c7  (未命名)            image

垫图出图: museav gen --project 2282ad52-b0e9-4c52-bcf1-339c8a43adad --ref <素材URL> --prompt '...'
`

test('projects 的 stdout 是 id 换行 —— 这条是契约，顺序也要保住', () => {
  assert.deepEqual(parseProjectIds(PROJECTS_STDOUT), [
    '6f250169-b42e-498b-a898-09efdc1441bb',
    '6babf21d-7a93-4bd5-94bb-0a46e001a416',
    '49a023a7-f3b0-4685-b4a4-fb0131df13e9',
    '2282ad52-b0e9-4c52-bcf1-339c8a43adad',
  ])
})

test('projects 的 stderr 表格补上名称 / 出图计数 / 素材数 / brand', () => {
  const table = parseProjectTable(PROJECTS_STDERR)
  assert.equal(table.get('6f250169-b42e-498b-a898-09efdc1441bb').name, '默认项目')
  assert.equal(table.get('6f250169-b42e-498b-a898-09efdc1441bb').genDone, 39)
  assert.equal(table.get('6f250169-b42e-498b-a898-09efdc1441bb').genTotal, 43)
  assert.equal(table.get('6f250169-b42e-498b-a898-09efdc1441bb').assetCount, 0)
  assert.equal(table.get('6babf21d-7a93-4bd5-94bb-0a46e001a416').name, '巴基斯坦站点群')
  assert.equal(table.get('49a023a7-f3b0-4685-b4a4-fb0131df13e9').brand, 'brandcheck')
  assert.equal(table.get('2282ad52-b0e9-4c52-bcf1-339c8a43adad').name, 'IP账户运营')
  assert.equal(table.get('2282ad52-b0e9-4c52-bcf1-339c8a43adad').assetCount, 1)
})

test('合并后按 stdout 的 id 顺序输出，字段来自 stderr', () => {
  const projects = mergeProjects(PROJECTS_STDOUT, PROJECTS_STDERR)
  assert.equal(projects.length, 4)
  assert.deepEqual(projects.map((p) => p.id), parseProjectIds(PROJECTS_STDOUT))
  assert.equal(projects[3].name, 'IP账户运营')
  assert.equal(projects[3].assetCount, 1)
})

test('stderr 认不出来时降级到 id 前 8 位，不许整页崩', () => {
  const projects = mergeProjects(PROJECTS_STDOUT, '上游改版了，这行看不懂\n')
  assert.equal(projects.length, 4)
  assert.equal(projects[0].name, '6f250169')
  assert.equal(projects[0].genTotal, null)
  assert.equal(projects[0].assetCount, null)
})

test('长项目名（>=16 字，CLI 不再补空格）也要能解析出名字', () => {
  const stdout = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\n'
  const stderr = '  aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee  一个非常非常长的项目名字  出图 1/2  素材 3\n'
  const [project] = mergeProjects(stdout, stderr)
  assert.equal(project.name, '一个非常非常长的项目名字')
  assert.equal(project.genDone, 1)
  assert.equal(project.assetCount, 3)
})

test('项目名里带空格也不会被截断', () => {
  const stdout = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\n'
  const stderr = '  aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee  IP 账户运营      出图 5/5  素材 0\n'
  const [project] = mergeProjects(stdout, stderr)
  assert.equal(project.name, 'IP 账户运营')
})

test('assets 的 stdout 是 id<TAB>url', () => {
  const assets = parseAssetTsv(ASSETS_STDOUT)
  assert.equal(assets.length, 1)
  assert.equal(assets[0].id, '630b8428-394f-472a-ad27-036dce46e9c7')
  assert.match(assets[0].url, /^https:\/\/img\.webkubor\.online\//)
})

test('assets 的 stderr 表格补上名称与 media_type', () => {
  const table = parseAssetTable(ASSETS_STDERR)
  const row = table.get('630b8428-394f-472a-ad27-036dce46e9c7')
  assert.equal(row.name, '(未命名)')
  assert.equal(row.mediaType, 'image')
  assert.deepEqual(row.tags, [])
})

test('assets 合并：url 以 stdout 为准，缺 stderr 时按扩展名猜类型', () => {
  const [asset] = mergeAssets(ASSETS_STDOUT, ASSETS_STDERR)
  assert.equal(asset.mediaType, 'image')
  assert.equal(asset.url, 'https://img.webkubor.online/refs/45d47835-cde2-4022-bd4d-5bc729ff8f1f/2282ad52-b0e9-4c52-bcf1-339c8a43adad/fa4af95b-323.png')

  const [guessed] = mergeAssets(ASSETS_STDOUT, '')
  assert.equal(guessed.name, '(未命名)')
  assert.equal(guessed.mediaType, 'image')
})

test('assets 的 tag 列表被拆成数组', () => {
  const stdout = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\thttps://x/y.mp4\n'
  const stderr = '  aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee  春天主视觉      video  [a,b]\n'
  const [asset] = mergeAssets(stdout, stderr)
  assert.equal(asset.name, '春天主视觉')
  assert.equal(asset.mediaType, 'video')
  assert.deepEqual(asset.tags, ['a', 'b'])
})

test('jobs 的 stdout 直接是 JSON 数组，裁剪后只留 tab 要显示的字段', () => {
  const stdout = JSON.stringify([
    {
      id: 'c2ee0e1d-7a54-439a-9feb-49296b023c47',
      status: 'done',
      media_type: 'image',
      model: 'ChatGPT Image2.5',
      cdn_url: 'https://img.webkubor.online/x.png',
      prompt: '小红书知识类笔记封面，3:4 竖版',
      ratio: '3:4',
      created_at: '2026-09-29T09:47:57.583131+00:00',
      workspace_id: null,
      elapsed_ms: 39494,
      error: null,
      // 这些字段 tab 一律不显示，summarize 后必须没有
      steps: [{ name: '图生图' }],
      reference_images: ['https://x/ref.png'],
    },
  ])
  const jobs = summarizeJobs(parseJobArray(stdout))
  assert.equal(jobs.length, 1)
  assert.equal(jobs[0].model, 'ChatGPT Image2.5')
  assert.equal(jobs[0].ratio, '3:4')
  assert.equal(jobs[0].elapsedMs, 39494)
  assert.equal(jobs[0].workspaceId, null)
  assert.equal(jobs[0].steps, undefined)
  assert.equal(jobs[0].reference_images, undefined)
})

test('jobs 的 stdout 不是合法 JSON 时返回空数组，不抛', () => {
  assert.deepEqual(parseJobArray(''), [])
  assert.deepEqual(parseJobArray('not json'), [])
  assert.deepEqual(parseJobArray('{"not":"an array"}'), [])
})
