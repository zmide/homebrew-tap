# Homebrew Tap

Homebrew packages maintained by zmide, with a searchable static catalog at
[brew.zmorg.cn](https://brew.zmorg.cn/). Release binaries remain in each
application's upstream repository; this repository contains recipes, catalog
source, and optional package-update automation.

## Install

```sh
brew tap zmide/tap
brew install zmide/tap/oci-mirror-proxy

brew update
brew upgrade zmide/tap/oci-mirror-proxy
```

Other recipes in `Formula/` and `Casks/` are discovered automatically, including
nested directories. Formulae and casks can share a name without sharing routes.
Review the package's platform support, dependencies, caveats and service
instructions before installing.

## Develop and build

Use macOS with Homebrew, especially for Casks. Node.js is pinned in `.nvmrc`
(`24.22.1`); pnpm is pinned in `package.json` (`10.20.0`).

```sh
nvm install
nvm use
corepack enable
corepack prepare pnpm@10.20.0 --activate
pnpm install --frozen-lockfile

TAP="$(node -p 'JSON.parse(require("node:fs").readFileSync("tap.config.json", "utf8")).tap')"
brew tap "$TAP" "$PWD"
pnpm catalog:export
pnpm generate
pnpm dev
```

The default development path is `/`; Simplified Chinese is at `/zh-CN/`.
Use `pnpm preview` after generation to preview production output.
**Deploy only `web/.output/public/`.** No Node.js or Homebrew runtime is needed
on the host. Cloudflare Pages setup is in [docs/deployment.md](docs/deployment.md).

`brew tap` clones Git and does not include uncommitted recipe changes or replace
an existing tap. Inspect `brew --repository "$TAP"` if the export reports stale
sources. Use the intended registered checkout, or explicitly synchronize your
recipes after reviewing its local changes. The exporter never overwrites a
developer's registered tap. CI registers first, copies candidate recipes, then
verifies their bytes and checksums.

### Checks

After building the catalog:

```sh
pnpm lint
pnpm fmt:check
pnpm type:check
pnpm test
pnpm generate
pnpm --dir web exec playwright install chromium
pnpm test:e2e
```

`pnpm fmt` formats source. Tests and fixed fixtures are maintained source, not
temporary data. Nuxt caches, generated snapshots, test reports and build output
are ignored by Git. There is no separate simulated catalog or production-data
fallback.

## Data and URLs

The catalog uses native `brew info --json=v2 --variations` data. Published JSON
objects retain unknown fields and platform variations. Search metadata, Git
timestamps and optional overrides are kept separately. These endpoints are
**build-time snapshots**, not live Homebrew APIs or a drop-in
`HOMEBREW_API_DOMAIN` mirror.

| Path                                                       | Content                                      |
| ---------------------------------------------------------- | -------------------------------------------- |
| `/`                                                        | Searchable catalog and recent recipe updates |
| `/formula/<name>/`, `/cask/<token>/`                       | Prerendered package details                  |
| `/api/formula.json`, `/api/cask.json`                      | Native package arrays                        |
| `/api/formula/<name>.json`, `/api/cask/<token>.json`       | Native package objects                       |
| `/badges/formula/<name>.json`, `/badges/cask/<token>.json` | Shields.io version metadata                  |

URL-encode package names as single path segments, including `@` and `+`.
All links respect `site.basePath`; the current site is deployed at `/`.

```sh
curl https://brew.zmorg.cn/api/formula/oci-mirror-proxy.json
```

Detail badges render locally without requesting external images; the copy
button provides Markdown using Shields.io and the public package URL. Versions
follow the latest deployed snapshot. Recipe dates come from Git, not upstream
release time. Installation statistics appear only when valid native Homebrew
analytics exist; missing data is never replaced by GitHub download counts or a
same-name core package's statistics.

See [the catalog contract](scripts/catalog/README.md) for offline snapshot
builds, provenance, generated files, version rules and output verification.

## Configuration and maintenance

Customize `tap.config.json`:

- `brand`: title, identity and English/Chinese introductory text.
- `tap` and `repository`: Homebrew identity and public repository URL.
- `site.origin` and `site.basePath`: public origin and trailing-slash base path.
- `i18n` and `recentLimit`: enabled locales and recent-update count.
- Optional `links` and `platformSupport`: reviewed per-package overrides, keyed
  by `formula:<full_name>` or `cask:<full_token>`. Ordinary packages do not need
  duplicate declarations; project links and platform evidence are derived from
  native records. Unconfirmed availability is not labeled unsupported.

The site uses Nuxt 4, Vue/TSX, SCSS, i18next, Shiki and Tile UI's Kumo theme.
It supports English/Chinese, system or saved color themes, and prerendered
content without JavaScript. UI source/update notes are in
[web/components/ui/README.md](web/components/ui/README.md).

Package-specific publishing is separate from catalog discovery. See
[docs/package-updates.md](docs/package-updates.md); adding a recipe does not
require registering an automatic updater.

## License

Original code is [MIT licensed](LICENSE). Retain
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and bundled asset licenses when
redistributing copied/adapted UI and artwork. Packages keep their own licenses.
This is an independent Tap site, not an official Homebrew or Cloudflare service.
