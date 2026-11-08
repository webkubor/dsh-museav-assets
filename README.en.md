# dsh-museav-assets

A **Museav** workspace for DeepSeek Harness: browse featured inspiration and available models, generate images, and manage project assets and works in one place.

Open **Museav** from the global left sidebar. The previous session-specific Assets tab is no longer registered. Existing projects and generation records remain available through the local **museav CLI**. Featured inspiration comes from MUSE AV's public API; the platform automatically selects the model for each generation.

## Install

> **Package name: `@dsh-plugins/dsh-museav-assets`** (same scope as the three sibling plugins).
> The unscoped `dsh-museav-assets` was a one-off name published by mistake; it was **unpublished**
> on 2026-10-02. Use the scoped name only.

On the desktop app, install it from the app's **plugin manager** (it pulls from npm) — the CLI
cannot write to the `desktop` profile
(`profile "desktop" is managed exclusively by the Electron application`).

Local development (try your changes in the desktop app):

```sh
npm run deploy     # gate → backup → install into ~/.dsh/profiles/desktop/ (refuses if the gate fails)
npm run rollback   # if the app won't start; rollback:npm reinstalls the npm release
```

See [../SOP.md](../SOP.md). On first install, also add the package to the profile (`~/.dsh/profiles/desktop/package.json`):

```jsonc
"dependencies": { "dsh-museav-assets": "^0.1.0" },
"dsh": { "profile": { "bundles": [ /* … */, "dsh-museav-assets" ] } }
```

Changing profile config is a topology change: **quit and reopen the desktop app** (`~/.dsh/restart.sh` is retired — it now detects the missing 3080 service and exits 1).
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

Route tests substitute a stub executable for the CLI (via the `MUSEAW_BIN` environment
variable) — no network, no real account.

Why an env var rather than plugin config: functional plugins in this Cordis cannot read
`ctx.config` (declaring it leaves the plugin `pending (waiting for service: config)`).
`MUSEAW_BIN` also matches the convention already used by the MCP bridge in the profile.
It is read per request, so changing it needs no plugin reload.
