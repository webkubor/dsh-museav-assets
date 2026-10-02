#!/usr/bin/env bash
# 一次性引导：给 @dsh-plugins/dsh-museav-assets 配 npm 可信发布者（Trusted Publisher）
#
# 为什么必须由人在终端里跑一次
# ------------------------------
# 本包 0.1.1 的 tag 早就推了、CHANGELOG 也写了「发布到 npm」，但 npm 上根本没有这个
# scoped 名（`npm view @dsh-plugins/dsh-museav-assets` → 404），只有 0.1.0 时代那个
# 无 scope 的历史名在。原因是 OIDC 直发要求 npm 侧**先为该包名配好可信发布者**，
# 而这一步是 npm 账户级写操作 —— 本机 vault 里那枚 token 是「Bypass 2FA=关」，
# 非交互环境里 npm 只会打印一个被掩码的授权 URL（https://www.npmjs.com/auth/cli/***），
# 拿不到可用链接。所以：人在终端跑一次，之后 OIDC 永久接管，再不需要 token/OTP。
#
# ⚠️ 全程只用验证器里的 6 位码。**绝不要用恢复码** —— vault 备注写明：
#    用恢复码会立刻冻结账户 72 小时。
#
# 用法（在任意目录）：
#   bash ~/dev/dsh-plugins/dsh-museav-assets/scripts/bootstrap-npm-trust.sh
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

# ky run 把 vault 里的 token 注进子进程环境（不打印明文），再回来跑 --inner 分支。
if [ "${1:-}" != "--inner" ]; then
  exec ky run --env NPM_TOKEN=secret://npm/webkubor-publish -- bash "$0" --inner
fi

PKG="@dsh-plugins/dsh-museav-assets"
REPO="webkubor/dsh-museav-assets"
WORKFLOW="publish.yml"

npmrc=$(mktemp)
trap 'rm -f "$npmrc"' EXIT
printf '//registry.npmjs.org/:_authToken=%s\n' "${NPM_TOKEN:?ky run 没注入 NPM_TOKEN}" > "$npmrc"
chmod 600 "$npmrc"
export NPM_CONFIG_USERCONFIG="$npmrc"

echo "── ① 先试配可信发布者（npm 会要 2FA：验证器 6 位码，或打开它给的链接）──"
if npm trust github "$PKG" --file "$WORKFLOW" --repo "$REPO" -y; then
  echo
  echo "✓ 完成。以后推 v* tag → GitHub Actions 用 OIDC 直发，不需要 token、不需要 OTP。"
  exit 0
fi

echo
echo "── ② 上面失败多半是因为「包名在 npm 上还不存在」→ 先手工首发一次占住名字 ──"
echo "   （会再要一次 2FA；prepublishOnly 里的发版门禁会先跑一遍）"
if ! npm publish --access public; then
  echo
  echo "✖ 首发也失败了。把上面的报错原样发给 dsh，不要自己反复重试（重复失败要查原因）。"
  exit 1
fi

echo
echo "── ③ 包名占住了，回头把可信发布者配上 ──"
if npm trust github "$PKG" --file "$WORKFLOW" --repo "$REPO" -y; then
  echo "✓ 完成：以后走 CI 直发。"
else
  echo "⚠️ 首发成功，但可信发布者没配上 —— 把报错发给 dsh。"
fi
