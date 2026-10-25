# Homebrew Tap

Homebrew packages maintained by zmide, with a searchable, static catalog at
[zmide.github.io/homebrew-tap](https://zmide.github.io/homebrew-tap/).
Release binaries stay in each application's upstream repository; this repository
contains Homebrew recipes, update automation, and the catalog website.

The website is built with Nuxt 4, Vue, TypeScript/TSX, SCSS, Tile UI's Vue
registry, its Kumo theme, and i18next. English (`en`) is the default, with
Simplified Chinese (`zh-CN`) available. It is an independent tap website, not an
official Homebrew service or an affiliated Cloudflare website.

Page sections share a responsive CSS Grid. Shell commands and structured JSON
use Shiki's GitHub light/dark highlighting; copying a command preserves its
original text. The color theme follows the system unless a visitor saves an
explicit preference.

## Install

```sh
brew install zmide/tap/oci-mirror-proxy
```

Or register the tap first:

```sh
brew tap zmide/tap
brew install zmide/tap/oci-mirror-proxy
```

To update:

```sh
brew update
brew upgrade zmide/tap/oci-mirror-proxy
```

Other packages added to `Formula/` or `Casks/` are discovered automatically by
the catalog. A formula and a cask can share a name; their routes and API
endpoints remain separate. Consult package details for platform, architecture,
dependencies, caveats, and service instructions before installing.

## Local development

Use macOS with [Homebrew](https://brew.sh/) for a fresh export, especially for
casks. Install [nvm](https://github.com/nvm-sh/nvm) and Corepack if they are not
already available. The project pins Node.js `24.22.1` in `.nvmrc` and pnpm
`10.20.0` in `package.json`.

```sh
git clone https://github.com/zmide/homebrew-tap.git
cd homebrew-tap
nvm install
nvm use
corepack enable
corepack prepare pnpm@10.20.0 --activate
pnpm install --frozen-lockfile

# Register this checkout using the identity in tap.config.json.
TAP="$(node -p 'JSON.parse(require("node:fs").readFileSync("tap.config.json", "utf8")).tap')"
brew tap "$TAP" "$PWD"

pnpm catalog:export
pnpm generate
pnpm dev
```

Open the URL printed by Nuxt, including the configured `/homebrew-tap/` base
path. For a production preview, use `pnpm preview` after `pnpm generate`.
The deployable directory is **`web/.output/public`**, not a nested
`web/.output/public/homebrew-tap` directory.

### Registered taps and local changes

`brew tap` clones Git; it does **not** preserve uncommitted recipe changes in
the source checkout. It also leaves an already registered tap in place rather
than replacing it. Inspect `brew --repository "$TAP"` if an export reports a
stale or mismatched tap. Use the intended registered checkout directly, or
explicitly synchronize your current Ruby recipes into it after registration.
Review any existing local changes first: the exporter deliberately never
registers, resets, or overwrites a developer's tap for them.

CI registers the tap from its checkout, copies the current Ruby recipes into
the registered tap **after** registration, and compares their bytes and SHA256
hashes. This ensures a pull request or generated update is evaluated instead
of the last committed formula.

### Offline snapshot builds

Capture a genuine native export with `pnpm catalog:export` while Homebrew is
available, then keep a copy of `web/.generated/info.v2.json`. To build offline
from that snapshot:

```sh
pnpm catalog:build --input /path/to/info.v2.json
pnpm --dir web generate
node scripts/catalog/verify-output.mjs
```

This explicit sequence skips the fresh export normally performed by
`pnpm generate`. The snapshot must belong to the configured tap and match the
current Ruby source set and SHA256 hashes. A stale snapshot fails validation;
it is not silently used as fallback production data. The captured fixture in
`scripts/catalog/fixtures/` is for reproducible tests, not a substitute for a
fresh production export. Generated data and build output are not committed.

### Checks

After exporting/building the catalog, run:

```sh
pnpm lint
pnpm fmt:check
pnpm type:check
pnpm test
pnpm generate
pnpm --dir web exec playwright install chromium
pnpm test:e2e
```

`pnpm fmt` formats the repository. Generator-only tests can also run without
frontend dependencies using `node --test scripts/*.test.mjs`.

## Data, routes, and API

The source of package metadata is Homebrew's own
`brew info --json=v2 --variations`, evaluated only for the configured tap's
discovered Ruby recipes. The raw native envelope is stored at
`web/.generated/info.v2.json`. The build preserves Homebrew objects, including
unknown fields and nested variations, instead of replacing them with a custom
package manifest or parsing Ruby with regular expressions.

With the default deployment configuration:

| URL under `/homebrew-tap/`   | Content                                                     |
| ---------------------------- | ----------------------------------------------------------- |
| `/`                          | Searchable catalog, kind filters, and recent recipe updates |
| `formula/<name>/`            | Prerendered formula detail                                  |
| `cask/<token>/`              | Prerendered cask detail                                     |
| `api/formula.json`           | Native Homebrew formula array                               |
| `api/cask.json`              | Native Homebrew cask array; `[]` when there are no casks    |
| `api/formula/<name>.json`    | One unmodified native formula object                        |
| `api/cask/<token>.json`      | One unmodified native cask object                           |
| `badges/formula/<name>.json` | Shields.io version metadata for a formula                   |
| `badges/cask/<token>.json`   | Shields.io version metadata for a cask                      |

Always URL-encode a package name/token as a single path segment, including `@`
and `+`. Prefix API requests and links with `site.basePath`; `/api/...` at the
domain root is wrong for a GitHub project site. For example:

```sh
curl https://zmide.github.io/homebrew-tap/api/formula/oci-mirror-proxy.json
```

The APIs are static build snapshots, not live Homebrew endpoints. Installations,
runtime service state, and upstream release availability can change after the
site was generated. The site does not fabricate analytics, download counts,
signatures, or Homebrew's signed/JWS API. It does not implement the full
`formulae.brew.sh` service or provide a drop-in `HOMEBREW_API_DOMAIN` mirror.
The native Homebrew `analytics` or other fields, if present in an export, are
preserved as supplied rather than invented.

Search, configured repository/release links, and Git-derived update timestamps
live separately in `web/.generated/search-index.json`, `enhancements.json`, and
`manifest.json`; they are not injected into native API objects. “Recently
updated” means the recipe's last Git commit, not its upstream release time or
filesystem modification time. Full Git history is required for accurate dates.
Detail pages also derive platform availability and GitHub project links directly
from native records, without modifying the published APIs or querying upstream.
See [`scripts/catalog/README.md`](scripts/catalog/README.md) for the data contract,
CLI flags, source provenance, and output verification.

### Package badges

Each detail page displays a locally rendered Homebrew/version badge and a subtle
copy icon. Hover or keyboard-focus the icon to see its purpose. Copying places
Markdown on the clipboard; success briefly changes the icon to a checkmark and
shows an overlay tooltip, without moving page content. A denied/unavailable
clipboard exposes selectable Markdown for manual copying. With JavaScript
disabled, the Markdown is also selectable.

The page preview uses only prerendered HTML/CSS and the site's own Homebrew logo;
it never requests an external badge image. Copied production Markdown uses a
stable Shields.io endpoint image linked to the public default-language detail
page, for example:

```markdown
[![Homebrew: zmide/tap/oci-mirror-proxy (formula)](https://img.shields.io/endpoint?url=https%3A%2F%2Fzmide.github.io%2Fhomebrew-tap%2Fbadges%2Fformula%2Foci-mirror-proxy.json&label=Homebrew&style=flat&logo=homebrew)](https://zmide.github.io/homebrew-tap/formula/oci-mirror-proxy/)
```

Versions follow the latest **deployed catalog snapshot**, not live upstream
releases. Formulae use `pkg_version` when provided; otherwise the stable version
includes a positive integer revision (`_N`), or a HEAD-only package shows `HEAD`.
Cask versions remain unchanged, including comma-separated versions and `latest`.
Missing versions display `unknown` in grey. The preview, detail version, search
index and generated metadata share these rules; native API objects are unchanged.
Shields.io and GitHub image caches can delay embedded version updates.

There is no customization panel. To change an embedded badge's appearance,
edit Shields.io URL parameters such as `label` (empty hides it), `style`
(`flat`, `flat-square`, `for-the-badge`), `color` (named color or hex without `#`),
or `logo`. Keep `url` pointing at the generated JSON for automatic version
updates. Fixed package-name/custom-text badges can instead use
`https://img.shields.io/static/v1?label=Homebrew&message=available&color=orange&logo=homebrew`;
URL-encode parameter values. These fixed-text images do not track catalog changes.

## Use this repository as a template

Repository owners can enable **Settings → General → Template repository**.
Others can then choose **Use this template** on GitHub, or fork/clone it. This
checkbox and GitHub Pages settings are remote repository settings; adding the
files here does not change them automatically.

Customize [`tap.config.json`](tap.config.json):

| Setting                                                                 | Purpose                                                                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `brand.name`, `brand.title`, `brand.description`, `brand.descriptionZh` | Site identity and introductory copy                                                                    |
| `tap`                                                                   | Homebrew `owner/tap` identity, such as `yourname/tools` for `yourname/homebrew-tools`                  |
| `repository`                                                            | Public repository URL                                                                                  |
| `site.origin`                                                           | Origin only, such as `https://yourname.github.io`                                                      |
| `site.basePath`                                                         | `/homebrew-tools/` for a project site, or `/` for a root/custom-domain site; keep the trailing slash   |
| `i18n.defaultLocale`, `i18n.locales`                                    | Default and enabled locales; supply translations when adding a locale                                  |
| `recentLimit`                                                           | Number of recent recipe updates to show                                                                |
| `links`                                                                 | Optional repository/release link overrides keyed by `formula:owner/tap/name` or `cask:owner/tap/token` |
| `platformSupport`                                                       | Optional reviewed overrides for inferred platform information, keyed by the same package identity      |

Neither `links` nor `platformSupport` is required; the default configuration
omits both. Platform information is derived from native bottles, explicit
platform/architecture markers in stable download filenames (including the
default record), runtime requirements and Cask `depends_on`. Native variation
deltas are applied before evaluating each target, so target-specific constraints
are not treated as global exclusions. No matching download or bottle means
unconfirmed availability, not “not supported”; variation names alone and generic
source archives do not establish support. Binary availability is labeled
separately from confirmed support and does not guarantee every OS version.
Bottle availability is shown only for its exact named targets. A minimum system
version is shown only when the records for that system agree.

Project repository and Releases links are derived from recognized HTTPS GitHub
repository, release, archive or tree URLs in stable/HEAD/Cask downloads and their
variations, with a GitHub homepage as fallback. Conflicting upstream repositories
are left unlinked rather than guessed. Other hosts and unrecognized paths are
not inferred; use `links` for those cases. Safe explicit links take precedence.

Optional platform declarations list `system` (`macOS` or `Linux`), `architectures`
(`name` and `status`: `supported`, `unsupported`, or `unknown`), and an HTTP(S)
`source` documenting the claim. They override the listed architectures while
preserving other native platform evidence. Review these when changing a recipe's
platform branches; ordinary packages need no duplicate declarations.
Apple and Tux icons are
standard brand artwork distributed by Devicon (MIT); trademarks remain with
their respective owners. See THIRD_PARTY_NOTICES.md.

The detail page's `Last publish` date is the package source's last Git commit in
this Tap, not the upstream release date; the adjacent help explains this source.
Platform variations remain in the native JSON; ordinary pages show grouped
platform-specific dependencies and service data without a configuration selector.
Primary project titles are plain text, with only their URLs linked; other
destinations are grouped under More links. Platform download menus are omitted;
use the upstream releases link for manual downloads. Native URLs remain in JSON.

### Local Demonstration Catalog

Run `pnpm dev:demo`, then open
`http://127.0.0.1:4175/homebrew-tap/` (or `/homebrew-tap/zh-CN/`).
The ten explicitly named `demo-*` fixtures cover a complete Formula, simulated
installation analytics (complete, missing-window, and twelve-option cases), mixed platform support and variations, a Cask, deprecated
and disabled packages, minimal metadata, and long-content/zero-count boundaries.
All pages carry a simulation warning; do not execute their installation commands.

Fixtures live in `web/demo/catalog-data.ts`. The development-only alias replaces
the catalog reader without writing real snapshots, config, API files or sitemaps.
Nuxt uses a separate `.nuxt-demo` build directory. `TAP_DEMO=1` is rejected for
build/generate commands; normal `pnpm generate` always uses the verified catalog.
Demo packages have no native API link. Their badges render locally and remain
copyable: demo Markdown uses a fixed-text Shields.io image with the simulated
version, linked to the current demo server rather than a nonexistent public
metadata endpoint. Stop the demo server with Ctrl-C.

Installation statistics read native Homebrew `analytics.install`,
`install_on_request`, and `build_error` windows (30/90/365 days). Valid available
windows render a grouped column chart: one column per installation entry within
each window, with a shared linear scale. The headline totals only the longest
available window, never the sum of overlapping windows. Hover or focus an individual column (tap on touchscreens) for exact values.
Missing entries leave an empty slot rather than implying zero. Official documentation is linked
inside the title help panel. Missing data is not
zero, and rolling windows are never plotted as daily history. No GitHub Release
statistics requests, tokens, or download-count cache are used. Packages without
valid installation data omit the module; valid all-zero installation windows show a no-statistics placeholder; third-party Tap data is never replaced
with a same-name core package's statistics.

Update the install examples and attribution for your own project. Replace the
sample recipe with your own `Formula/**/*.rb` and/or `Casks/**/*.rb`; nested
directories are supported. Add ordinary Homebrew installation and test blocks,
then export, build, and run the checks. **Adding a recipe to the catalog does
not require adding it to `scripts/select-package.mjs`.** That allowlist is only
for the optional, package-specific release automation described below.

Tile UI Vue source components are installed through the shadcn registry in
`web/components.json` (`@tile-ui` at `https://vue.tileui.zmorg.cn/r/{name}.json`).
Run the UI CLI from the web workspace, for example
`pnpm --dir web ui:add @tile-ui/button`, and review generated changes. The Kumo
theme supplies design tokens; this Vue site does not load Cloudflare's React
component runtime. Keep upstream notices when copying or adapting UI source.

## GitHub Actions and Pages setup

- **Check tap** runs generator tests and recursive Ruby syntax checks (safe for
  absent/empty formula or cask directories). Its macOS web job fetches full Git
  history, exports fresh Homebrew metadata, and runs lint, formatting, type,
  unit, generation, output-verification, and Chromium browser checks. Pull
  requests have read-only repository permissions and need no secrets.
- **Update package** validates, tests, and publishes allowlisted formula updates
  independently of the website. A website failure cannot block formula
  publication.
- **Deploy Pages** runs for default-branch pushes, manual default-branch runs,
  and successful same-repository/default-branch `Update package` completions.
  The completion trigger is necessary because a commit pushed with
  `GITHUB_TOKEN` does not trigger a normal push workflow. It checks out the
  **latest trusted default branch**, not the earlier update workflow's SHA,
  then freshly exports, checks, and generates the site on macOS. Only the
  separate Ubuntu deployment job receives `pages: write` and `id-token: write`.
  A single Pages concurrency group queues deployments without cancelling an
  active deployment.

To enable publishing on your GitHub repository:

1. In **Settings → Actions → General**, allow the required Actions. Permit
   `GITHUB_TOKEN` write access only if using the optional formula publisher;
   branch protection/rules must also permit that bot's commits.
2. In **Settings → Pages → Build and deployment**, set **Source: GitHub Actions**.
   Check the `github-pages` environment's deployment rules for your default
   branch, particularly after changing the default branch.
3. Set `site.origin` and `site.basePath` to the actual Pages URL. For a custom
   domain, also configure its DNS/Pages domain settings separately.
4. Push to the default branch or manually run **Deploy Pages** there. Inspect
   Actions and the `github-pages` environment for deployment results.

No deployment token or private API key is required. These workflows do not
enable Pages, change repository settings, register a custom domain, or send
upstream dispatches on their own. The build artifact is `web/.output/public`.

## Optional automated formula updates

The existing **Update package** workflow accepts `repository_dispatch` events
of type `update-package`, or a manual package name and stable release tag. It
is scoped to the packages registered in `scripts/select-package.mjs`, currently
`oci-mirror-proxy`. Only the upstream's latest stable release is accepted.

Generated formulae are downloaded as candidate artifacts, copied into the
registered tap **after** `brew tap`, compared byte-for-byte and by SHA256, and
checked with `brew info` to ensure the candidate version matches the requested
tag. Installation, formula tests, and service inspection run on macOS and
Linux before publication. Concurrent publishers retry against the latest
default branch; newer stable releases supersede older update requests.

Example dispatch payload:

```json
{
	"event_type": "update-package",
	"client_payload": {
		"package": "oci-mirror-proxy",
		"tag": "v0.0.51"
	}
}
```

Upstream workflows need a fine-grained token with access only to this
repository and **Contents: Read and write** permission to send dispatches.
Keep that token in the upstream repository's secrets, never in this public
configuration. The tap uses its own `GITHUB_TOKEN` to commit. A successful
dispatch means the update was queued, not that installation tests, publication,
or Pages deployment succeeded; inspect Actions and rerun failures as needed.

To automate another package, explicitly add its upstream/generator to
`scripts/select-package.mjs`, the manual workflow's package choices, and tests.
Generators accept a tag, checksum file, and output path, and must retain
package-scoped installation/test behavior. Upstream dispatches must be sent
only after all release assets are ready. This is optional: manually maintained
formulae and casks work without this automation or any dispatch credential.

## License and attribution

This repository's original code is [MIT licensed](LICENSE). Copied/adapted Tile
UI code and Kumo design material retain their respective MIT notices in
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). Runtime dependencies keep
their own upstream licenses. Package recipes, metadata, and links do not
relicense the upstream applications or their release binaries, and no upstream
endorsement is implied.
