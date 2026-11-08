#!/bin/bash
# 仓库级 pre-commit 门禁（由全局 ~/.config/git/hooks/pre-commit 调用）。
# 只快检：产物语法 + DSH 宿主契约（真 cordis 内核试跑 apply，约 3 秒）。
# 2026-10-30 加：起因是 bloom 分支产物让桌面端起不来，见 ../SOP.md「部署门禁」。
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

for f in lib/*.js; do node --check "$f"; done

if git diff --cached --name-only | grep -qE '^(lib/|package\.json$)'; then
  node ../scripts/dsh-dev.mjs check
fi

echo "✓ pre-commit checks passed"
