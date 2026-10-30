# Isolated Varnish CI

## Status and handoff

This implementation was **source-reviewed only** in the dedicated `jarvis/ci-checks`
worktree. No npm, application, browser, unit tests, build, or controller code was
executed there. No commits, pushes, PRs, credentials, or changes to other worktrees
were made. The commands below are for the **parent's dedicated Linux VM**, not the
controller. They are validation instructions, not passing-test claims.

**Before publishing:** generate `tools/package-lock.json` in that VM, copy back
only that generated lockfile, review it against `dependencies.json`, and run the
checks. The workflow deliberately uses `npm ci` and will fail without the lockfile;
it never silently resolves a floating range. No root package.json is needed.

Playwright stays at **1.50.0**, the existing tooling's minimum version (Node >=18),
with exact `playwright-core` **1.50.0**, optional Darwin `fsevents` **2.3.2**. Public
registry tarball URLs/integrities are recorded in `dependencies.json` to support
verified tarball staging and offline VM installation. That metadata is **not** a
substitute for npm's VM-generated lockfile. Chromium revision is chosen by this
pinned Playwright release; stage its browser cache and OS dependencies for offline
VM use too. Do not change resolved URLs in the lockfile to controller-local paths.

## VM validation

From the VM copy's actual repository root (confirm with `pwd`):

```sh
# VM ONLY; use the staged registry cache when the VM is offline.
(cd tools && npm install --package-lock-only --ignore-scripts --no-audit --no-fund)
(cd tools && npm ci --ignore-scripts --no-audit --no-fund)
export PLAYWRIGHT_BROWSERS_PATH=/tmp/varnish-ci-browsers
(cd tools && ./node_modules/.bin/playwright install --with-deps chromium)
node tools/ci/source-check.mjs
node --test tools/ci/*.test.mjs
python3 -B -m unittest discover -s tools/ci -p 'test_*.py'

# Online VM acquisition; skip this when using the already verified same VM binary.
python3 -B tools/ci/download.py /tmp/varnish-ci-bin/term-llm
# Use that absolute binary path or the existing approved VM binary path below.
# $USER must be the dedicated unprivileged VM account, not root.
mkdir -p tools/out/ci
sudo unshare --net -- bash -c '
  set -euo pipefail
  ip link set lo up
  exec runuser -u "$1" -- env PATH="$2" PLAYWRIGHT_BROWSERS_PATH="$3" \
    python3 -B tools/ci/run.py "$4"
' _ "$USER" "$PATH" "$PLAYWRIGHT_BROWSERS_PATH" /tmp/varnish-ci-bin/term-llm
```

Do not fall back to an existing server if namespace setup, readiness, a selector,
or a network guard fails. Inspect synthetic `tools/out/ci/report.json`, screenshots,
`server.log`, and the runner's stderr. Check cleanup after success, assertion failure,
and termination in the VM. A fresh namespace requires `unshare`, `ip`, `runuser`, and
permission to create network namespaces; CI uses an ephemeral GitHub-hosted runner.
If the dedicated VM forbids namespaces, report that blocker rather than weakening
isolation or running against the operator's server.

## Scope and boundaries

- `source-check.mjs`: parse-only JS syntax (ESM via stdin, no root package), manifest
  CSS/JS file existence and confinement, example config shape/JSON, MIT/OFL license
  presence, and the same pre-JS light-token comparison used by the existing tool.
  No formatter, strict lint rollout, app import, build, or dependency install.
- `run.py`: checksum-gated binary; fresh temporary HOME/config/data/cache and cwd;
  explicit extension runtime copy; synthetic `{}` local settings and **empty session
  store**; debug provider; loopback only, auth none for this fixture only; projects,
  search, native search, location sharing and widgets disabled. No discovery, process
  argument scanning, provider credentials, personal settings, or personal chats.
  Children have owned process groups; readiness/browser waits and cleanup are bounded.
- Network namespace has only loopback, so neither the server nor Chromium can call
  external services at runtime. Setup downloads happen before entering it. The browser
  additionally blocks service workers, all WebSockets, all non-GET requests, external
  origins, and API reads outside an explicit metadata allowlist. Providers/models are
  **local metadata reads**, not provider inference calls. Unexpected requests fail the
  check; do not casually widen the allowlist. No send, real `/compact`, runtime action,
  project/widget/search/location action, or completion mock is part of the baseline.
- Browser coverage: real Varnish loading and shell hooks, system dark/light, mobile,
  actual keyboard palette open/filter/arrow/Enter/Escape, and opening/closing the real
  settings UI through its safe palette command. No required chat rows/groups or
  conditional generation/thread controls. Screenshots are evidence, **not** a pixel
  regression oracle. Selector and metadata compatibility still require the VM run.
- Only `tools/out/ci/` is uploaded (always, including failures; three-day retention).
  Its data is synthetic. Existing `tools/check.mjs`, screenshots and live-preview
  tools can discover personal servers and show actual chats: **CI never runs them**
  and never uploads their output directories. Setup failures may have no screenshot;
  the Actions step log remains evidence. No auth-state export, HAR, or browser trace.
- Pull-request code runs without secrets or persisted Git credentials; only
  `contents: read`, never `pull_request_target`, merge, deploy, or write permissions.
  This is isolation for the fixture, not a claim that untrusted PR JavaScript itself
  can be sandboxed by a route handler. Review workflow/script changes before approval.

PR1's compaction CSS fixture is not on main and is intentionally not copied here.
CI can gain branch-specific scripts once those changes are present after merge;
completion-mock coverage would be a separately labelled future addition. The approved
one-time third **CI-only draft PR** exception is for the parent to publish after
owner review, not permission to change the ordinary PR cap or publish from this task.

## Pin provenance

Public GitHub tag refs were read to verify these exact action release commits:

- [checkout v4.2.2](https://api.github.com/repos/actions/checkout/git/ref/tags/v4.2.2):
  `11bd71901bbe5b1630ceea73d27597364c9af683`
- [setup-node v4.4.0](https://api.github.com/repos/actions/setup-node/git/ref/tags/v4.4.0):
  `49933ea5288caeca8642d1e84afbd3f7d6820020`
- [upload-artifact v4.6.2](https://api.github.com/repos/actions/upload-artifact/git/ref/tags/v4.6.2):
  `ea165f8d65b6e75b540449e92b4886f43607fa02`

The [official v0.9.88 release API](https://api.github.com/repos/SamSaffron/term-llm/releases/tags/v0.9.88)
reports asset `term-llm_0.9.88_linux_amd64.tar.gz`, 22,354,359 bytes, SHA-256
`e7befc8b5e6fa768c5d2574d5b015f40979979e8a7b36ff47e06c2477f1b25e1`.
The parent independently verified that metadata and supplied the approved extracted
Linux binary SHA-256
`320c5faa3379ae7a52ea9050c8514684e5da71326da0c5d899c6a5405d72bff0`
for the known 0.9.88 / `c04964eb` fixture. The full source reference used for API
inspection is `c04964eb9ebb0c463ef29360d057d144b98a6814`; binary identity here is
verified by **bytes**, not by trusting a version string or assuming the release tag
points at that source commit. No source build equivalence is claimed.

`download.py` uses curl HTTPS-only redirects to the fixed official asset, verifies
archive size/hash, lists and validates all members before copying only the exact
root regular `term-llm` member, and verifies the binary hash before setting its mode.
No latest lookup or downloaded checksum file is trusted. `run.py` repeats the binary
hash check, including for the existing offline VM binary. The external VM fixture
script was read only as a reference and was not modified.
