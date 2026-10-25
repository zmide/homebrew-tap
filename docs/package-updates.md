# Optional package publishing

Catalog discovery is generic: add a recipe under `Formula/` or `Casks/`, then
rebuild. No updater allowlist or upstream credential is required.

The **Update package** workflow is separate, optional automation. Its explicit
allowlist in `scripts/select-package.mjs` currently registers only
`oci-mirror-proxy` from `runui/oci-mirror-proxy`. Its generator and tests live in
`scripts/packages/oci-mirror-proxy.mjs` and `oci-mirror-proxy.test.mjs`. They
encode that application's asset names, installation, caveats and service; they
are not a generic Formula or Cask generator.

## Trigger

Run the workflow manually with a package and stable `vMAJOR.MINOR.PATCH` tag, or
send a `repository_dispatch` event:

```json
{
	"event_type": "update-package",
	"client_payload": { "package": "oci-mirror-proxy", "tag": "v1.0.19" }
}
```

The upstream must dispatch only after all release assets are ready. A scoped
upstream token needs Contents: Read and write on this repository to dispatch;
store it in upstream secrets, not public configuration. A successful dispatch
only means the work was queued.

## Validation and publication

Only the upstream's latest stable release is accepted. Candidate formulae are
generated from `SHA256SUMS`, installed and tested on macOS and Linux before
publication. CI registers the tap before copying the candidate, checks its bytes
and SHA256, and verifies that Homebrew sees the requested version. The updater
opts into service inspection through its allowlist entry's `inspectService`;
ordinary CLI packages need not implement a service.

The publisher uses this repository's `GITHUB_TOKEN` and retries competing
updates against the latest default branch. Newer stable releases supersede old
requests. Repository Actions write permissions and branch rules must permit
the bot's commits. Website build/deployment failures do not block recipe
publication; inspect the separate Cloudflare workflow for site failures.

## Add an updater

1. Add a package-specific generator and test under `scripts/packages/`.
2. Register its trusted repository, generator and optional service inspection
   in `scripts/select-package.mjs`.
3. Add it to the manual choices in `.github/workflows/update.yml` and selector
   tests. Review OS/install assumptions: the current workflow updates Formulae,
   not arbitrary Casks.

The current formula's generated-comment path is historical; future updates use
the relocated generator. Relocation alone does not change the recipe bytes,
checksums or package version.
