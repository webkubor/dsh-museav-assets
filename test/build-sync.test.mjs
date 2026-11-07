import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { test } from 'node:test'

for (const name of ['client', 'index']) {
  test(`${name} 发布文件与 TypeScript 源码同步`, () => {
    const source = readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8')
    const built = readFileSync(new URL(`../lib/${name}.js`, import.meta.url), 'utf8')
    assert.equal(built, stripTypeScriptTypes(source, { mode: 'strip' }), '请运行 npm run build:client')
  })
}
