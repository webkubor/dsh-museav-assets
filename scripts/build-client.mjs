import { readFile, writeFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

for (const name of ['client', 'index']) {
  const source = await readFile(new URL(`../src/${name}.ts`, import.meta.url), 'utf8')
  const output = stripTypeScriptTypes(source, { mode: 'strip' })
  await writeFile(new URL(`../lib/${name}.js`, import.meta.url), output)
}
