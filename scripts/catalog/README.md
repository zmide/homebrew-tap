# Catalog pipeline contract

The source of truth is `brew info --json=v2 --variations`. No application package schema replaces or modifies native Homebrew objects. Unknown fields, nested variations, and empty arrays are preserved.

## Commands

```sh
# Requires an explicitly registered tap whose Ruby sources match this checkout.
node scripts/catalog/export.mjs

# Reuse a source/HEAD-verified export, or export with brew, then build all files.
node scripts/catalog/build.mjs

# Offline build from a captured native snapshot; source paths/checksums must match.
node scripts/catalog/build.mjs --input path/to/info.v2.json

# Run after Nuxt generation.
node scripts/catalog/verify-output.mjs

node --test scripts/catalog/*.test.mjs
```

All commands support `--tap-root PATH` and `--config PATH`. Export supports `--output PATH`; build supports `--generated-dir PATH` and `--public-dir PATH`; verification supports `--generated-dir PATH` and `--output-dir PATH`. Relative explicit paths resolve from the process working directory. Defaults resolve from the tap root.

Export removes inherited `HOMEBREW_NO_INSTALL_FROM_API`, suppresses automatic update/analytics/Bootsnap, and evaluates only fully qualified names discovered in `Formula/**/*.rb`, `Casks/**/*.rb`, or legacy `Cask/**/*.rb`. Export never registers, synchronizes, or changes a developer's tap. In CI, register the tap explicitly and copy the current candidate Ruby sources into that registered tap **before** exporting. Source sets, identities, counts, native source paths, and SHA256s must agree; a stale registered tap fails before brew info runs.

An empty tap template exports the native v2 envelope `{ "formulae": [], "casks": [] }` and builds empty collections/search data without Homebrew or a registered tap. It never invokes `brew info` without package names.

## Generated files / frontend types

Importable derived-data types are exposed in `scripts/catalog/types.d.ts` (`SearchEntry`, `Enhancements`, `CatalogManifest`, `CatalogRoute`, and `CatalogSource`). They intentionally do not replace native Homebrew formula/cask types.

- `web/.generated/info.v2.json`: native `{ formulae, casks, ...unknown }` envelope. With one kind, exact Homebrew stdout bytes; with both kinds, native arrays are combined without altering any object. Each explicit-kind response is also preserved byte-for-byte as `info.v2.formula.raw.json` / `info.v2.cask.raw.json`.
- `web/.generated/info.v2.provenance.json`: snapshot SHA256, tap, export timestamp, checkout HEAD, the complete source set/checksums, and `homebrew: { version, platform: { os, arch, release } }`. Version is the first line of `brew --version` (null for empty taps). A default build reuses an export only if all identities/checksums and HEAD still match; otherwise it exports fresh. `--input` is explicit offline input and still requires matching source bytes.
- `web/.generated/public/api/formula.json`: the unmodified `formulae` array.
- `web/.generated/public/api/cask.json`: the unmodified `casks` array (including `[]`).
- `web/.generated/public/api/formula/<name>.json` and `api/cask/<token>.json`: individual unmodified objects. Filesystem names are native names, URLs must encode the segment. Nuxt must register `.generated/public` as public assets.
- `web/.generated/public/badges/formula/<name>.json` and `badges/cask/<token>.json`: separate Shields.io endpoint metadata. These are derived files, never fields added to native API records; missing/deleted packages have no badge file, and builds remove stale badge JSON for either kind.
- `web/.generated/search-index.json`: an array of the following lightweight derived entries. Package identity always includes kind, so a formula and cask may share a name.

```ts
type Kind = 'formula' | 'cask';
type SearchEntry = {
	kind: Kind;
	name: string; // formula.name or cask.token
	fullName: string; // formula.full_name or cask.full_token
	displayName: string; // formula.name or cask.name[0]
	desc: string;
	version: string; // shared display version: pkg_version, stable[_N], HEAD, or native cask.version; '' if missing
	aliases: string[]; // formula.aliases; [] for casks
	updatedAt: string | null; // ISO UTC commit date, never filesystem mtime
};
type Enhancements = Record<
	`${Kind}:${string}`,
	{
		updatedAt?: string;
		links?: Record<string, string>; // configured links, not injected into Homebrew JSON
	}
>;
```

`web/.generated/enhancements.json` is an `Enhancements` dictionary. Update timestamps use `git log -1 --follow --format=%cI -- <ruby_source_path>`. Sources with no tracked history have no `updatedAt` enhancement and a null search timestamp.

`links` and `platformSupport` are optional config overrides, not required
per-package metadata. The detail view derives platform availability from native
bottles, explicit stable binary filenames, runtime requirements and Cask
`depends_on`, evaluating each merged variation independently. It distinguishes
binary/bottle availability from a reviewed compatibility declaration; missing
metadata or a variation name alone cannot establish support or exclusion.
Recognized HTTPS GitHub download/repository URLs also supply project repository
and Releases links (homepage fallback, no inference for conflicting repositories).
These presentation-only values require no network calls and are never injected
into native JSON or written back to configuration. Configured links remain in
the enhancements sidecar; inferred links are computed from the native record.

`web/.generated/manifest.json`:

```ts
type Manifest = {
	schemaVersion: 1;
	generatedAt: string;
	tap: string;
	repository: string;
	site: { origin: string; basePath: string };
	input: { path: string; sha256: string };
	git: { head: string | null; dirty: boolean };
	homebrew: { version: string | null; platform: { os: string; arch: string; release: string } | null };
	counts: { formula: number; cask: number };
	sources: Array<{ kind: Kind; name: string; path: string; sha256: string }>;
	routes: Array<{ kind: Kind; name: string; path: string; apiPath: string }>;
	api: { formula: 'api/formula.json'; cask: 'api/cask.json' };
};
```

Route paths are relative, URL-encoded paths such as `formula/tool%402%2Bkit`. Join `${config.site.basePath}${route.path}/` when creating links or prerender routes. Nuxt output must remain `web/.output/public`, not nested under the deployment base path. Verification accepts encoded or decoded static route directories, compares every API object to the original native JSON, checks counts/provenance, validates every badge against its native package, and rejects missing, modified or stale badge/API endpoints.

## Version badges

`shared/homebrew-version.mjs` is used by catalog search, badge generation, detail
pages and the demo index. A nonblank formula `pkg_version` takes precedence;
otherwise stable versions append `_N` only for positive integer revisions.
HEAD-only formulae show `HEAD` without a revision suffix. Native cask strings
(including `latest` and comma-separated values) are preserved. Missing/blank
versions are absent from the shared formatter, empty in search, `—` in detail
metadata and `unknown` in badge text. Native JSON is never rewritten.

The Shields.io schema is deliberately small:

```json
{
	"schemaVersion": 1,
	"label": "Homebrew",
	"message": "1.2.3_2",
	"color": "orange",
	"namedLogo": "homebrew"
}
```

Unknown versions use `message: "unknown"` and `color: "lightgrey"`. JSON is
written under the effective `publicDir`; the normal static build publishes it
from `.output/public/badges/`. A formula and cask with the same name always have
separate endpoints. The version updates on successful site deployment; external
Shields.io/GitHub image caches may delay the visible change.

`web/lib/homebrew/badges.ts` builds encoded endpoint and image URLs from the
configured public origin and effective base path, independent of the active
locale or localhost preview origin. Version mode uses `/endpoint?url=...`;
name/custom modes use `/static/v1` with a fixed `message`. It normalizes text,
style and color options without exposing a form on detail pages. Shields.io
appearance parameters may also be edited directly in copied image URLs.
The default endpoint URL does not override the metadata color, so a package
can transition between known and unknown versions without changing embed URLs.

On-page previews are local HTML/CSS using current package data and the local
Homebrew logo, not external image requests. Demo copies use static Shields.io
images and current-server detail links; they work without generated public
demo JSON. Neither previews nor badge generation require a backend, tokens,
additional workflow permissions or changes to Homebrew API objects.

The manifest's Homebrew metadata describes the original export host, not a later build host. Legacy snapshots without matching export metadata remain reusable and report `{ version: null, platform: null }`; a brand-only configuration edit does not force re-export. Native original JSON bytes are never changed to add provenance or formula revision suffixes.

Verification honors `NUXT_APP_BASE_URL` when present (including `/` for root deployment), with the same safe path validation as `site.basePath`. The manifest must still match the source configuration's `site`; the environment override never rewrites source provenance.

The fixture `fixtures/info.v2.raw` is a real, unformatted JSON export of the committed `oci-mirror-proxy` formula, not sample production content. Synthetic packages exist only inside tests.
