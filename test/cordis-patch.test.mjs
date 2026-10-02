// cordis.patch.yml 的发布前校验（零依赖 —— 本仓刻意不引任何运行时依赖，
// 为一条检查装 js-yaml 不划算，而且 dsh 的加载器用的是它自己那份）。
//
// 2026-10-02 实际炸过一次：包名从无 scope 迁到 @dsh-plugins 时，只给 `name` 加了引号，
// 漏了 `id`。而 `@` 是 YAML 保留起始字符，不加引号整个文件解析失败，症状是
//   dsh: installation rejected: Cannot validate installed package …:
//   YAMLException: bad indentation of a mapping entry (9:11)
// —— 报错指向 patch 文件，看着像配置写错，其实是包名没引用。装不上、也 boot 不了，
// 而且是**发布之后**才在别人机器上炸，本机不一定复现（本机装的是同名本地副本）。
//
// 所以这里不测"文件长什么样"就完事，而是直接对源文本做 YAML 标量合法性检查：
// 凡是「裸标量」位置的 `@…` 一律拦下，这是 YAML 规范层面的硬错误，不存在误报。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const patchPath = resolve(root, 'cordis.patch.yml');
const patchText = readFileSync(patchPath, 'utf8');
const lines = patchText.split('\n');

/** 去掉行尾注释后取该行的值部分（`<indent>- key: value` 或 `key: value`）。 */
function valueOf(line) {
  const m = line.match(/^\s*(?:-\s+)?([A-Za-z_][\w.-]*)\s*:\s*(.*)$/);
  if (!m) return null;
  let value = m[2];
  // 去掉行尾注释（值里若有引号包裹的 # 则不受影响，这里只处理常见形态）
  if (!/^['"]/.test(value)) value = value.replace(/\s+#.*$/, '');
  return { key: m[1], value: value.trim() };
}

test('cordis.patch.yml 里没有未加引号的 @scope 值', () => {
  const offenders = [];
  lines.forEach((line, i) => {
    const parsed = valueOf(line);
    if (parsed === null) return;
    const { key, value } = parsed;
    if (value.startsWith('@')) {
      offenders.push(`  第 ${i + 1} 行  ${key}: ${value}`);
    }
  });
  assert.deepEqual(
    offenders,
    [],
    'YAML 里 @ 是保留起始字符，必须加引号：\n' + offenders.join('\n')
  );
});

test('insert 引用的 id/name 等于本包名', () => {
  const ids = lines
    .map((l) => valueOf(l))
    .filter((p) => p && p.key === 'id')
    .map((p) => p.value.replace(/^['"]|['"]$/g, ''));
  assert.ok(ids.length > 0, '至少应有一条 id');
  for (const id of ids) {
    assert.equal(id, pkg.name, `patch 里的 id（${id}）必须等于包名（${pkg.name}）`);
  }
});

test('顶层是条目数组，且至少有一条 insert', () => {
  assert.ok(
    lines.some((l) => /^-\s/.test(l)),
    '顶层必须以 `- ` 开头（条目列表）'
  );
  assert.ok(
    lines.some((l) => /insert\s*:/.test(l)),
    '至少应有一条 insert'
  );
});
