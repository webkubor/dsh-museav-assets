# dsh-museav-assets

An **Assets** tab for DeepSeek Harness: browse MUSE AV assets by project (workspace)
and see recent generations. Click an asset to copy its direct URL, ready to use as a
ref image (`museav gen --ref <url>`).

Built on the local **museav CLI**. It deliberately does not re-implement generation
or upload — those stay with the `mcp__museav__*` tools already bridged into DSH. This
plugin only adds the missing view: *which projects do I have, and what is in each one*.

## Where the tab goes

The sixth tab in the main area, registered on `conversation.view` with **order 40**,
after Chat (0) / Trajectory (10) / Memory (20) / Context / Computer Environment (30).

```js
ctx.slots.register({
  name: 'conversation.view',
  id: 'museav-assets',
  order: 40,
  label: () => t('title'),   // "Assets"
}, AssetsView)
```

Main area rather than the right panel: assets are a one-screen job (project chips +
thumbnail grid + generation feed); the right panel is a narrow pane meant for a single
selected object, and its tab semantics are "the thing you currently have open" — assets
are global and belong to no session. There is precedent for a global view living in the
session shell: `dsh-user-mirror`'s Memory tab does the same.

## Install

```sh
npm run deploy   # rsync into ~/.dsh/profiles/web/node_modules/dsh-museav-assets/
```

Then add the package to the profile (`~/.dsh/profiles/web/package.json`):

```jsonc
"dependencies": { "dsh-museav-assets": "^0.1.0" },
"dsh": { "profile": { "bundles": [ /* … */, "dsh-museav-assets" ] } }
```

Changing profile config requires a restart: `~/.dsh/restart.sh`
(never `launchctl kickstart` directly).

Only prerequisite: the local `museav` CLI is logged in (`museav login`).
The plugin never reads or forwards the token in `~/.museav.json`.

## Endpoints

| Route | What it does |
|---|---|
| `GET /api/dsh-museav-assets/health` | CLI presence + version + workspace cap |
| `GET /api/dsh-museav-assets/projects` | Workspaces with gen/asset counts + `used/limit/full` |
| `POST /api/dsh-museav-assets/projects` | `{name}` create a workspace (≤20 chars) |
| `GET /api/dsh-museav-assets/assets?project=<id\|name>` | Assets in that workspace |
| `GET /api/dsh-museav-assets/jobs?limit=<n>` | Recent generation records |

Failure semantics: any upstream/CLI error returns **200 + `{ok:false,error}`** so the tab
can render the reason inline; only invalid parameters return 400. One flaky request
should not blank the tab.

## The CLI contract

`lib/museav.js` is the only file that knows what the CLI output looks like. museav-cli's
stdout/stderr split *is* its scripting contract:

| Command | stdout (source of truth) | stderr (human-facing extras) |
|---|---|---|
| `museav projects` | one id per line | name / gen x/y / assets n / brand |
| `museav projects assets --project X` | `id<TAB>url` | name / media_type / tags |
| `museav jobs` | **a full JSON array** | a pretty summary |
| `museav projects create --name N` | the new id | success message |

So: truth comes from stdout, stderr only fills in display fields. If stderr stops
parsing, the view degrades (name falls back to the first 8 chars of the id, asset name to
"(unnamed)") rather than going blank. `test/museav-parse.test.mjs` pins this against
output captured from the real CLI.

> Known fragility: `museav projects` and `projects assets` have **no `--json`**, so the
> display fields can only be parsed out of the stderr table. Adding `--json` to those two
> commands in museav-cli removes the fragility for good — the source of truth there is
> `~/dev/muse/museav-cli/src/commands/projects.ts`, a different repo.

## Non-goals

- No generation, no uploads — that is the CLI/MCP's job; a second implementation only
  creates two places to drift
- No caching — the data is cheap and the state moves; add a cache if it is ever needed
- No polling — one fetch on mount, then only when the user hits Refresh

## Tests

```sh
npm run check && npm test   # 28: 12 parsing contract + 8 routes + 8 UI
```

Route tests substitute a stub executable for the CLI (`cliBin` is configurable) — no
network, no real account.
