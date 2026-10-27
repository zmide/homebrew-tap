# Package publishing

The **Update package** workflow accepts an ordinary Homebrew Ruby recipe in a
notification. The upstream does not need to upload the rb to a Release, commit
it to its repository, or add custom metadata comments. Existing publishers can
continue sending their original notifications.

## Allow new sources

Set the tap's repository Actions variable `HOMEBREW_UPDATE_TRUST` to a JSON array:

```json
["trusted-owner", "another-owner/*", "third-owner/tool"]
```

A bare owner or `owner/*` allows all its repositories; `owner/repository` allows
only that repository. Matching is case-insensitive; other wildcard patterns are
invalid. An empty or missing variable disables new packages, not existing ones.

Only the source authenticated by GitHub Actions OIDC is matched against this
list. A repository name in the notification is not identity proof.

Existing packages derive their fixed upstream from GitHub Release download URLs
in the recipe already committed to the tap; legacy packages retain their original
upstream configuration. No separate source registry or metadata comment is used.
All declared URL stanzas in a direct recipe must have a literal
`https://github.com/owner/repository/releases/download/` prefix pointing to the
authenticated source. Tag/filename interpolation is allowed, but dynamic source
prefixes, non-GitHub downloads and multiple upstreams are rejected rather than
guessed. Changing upstream or package type requires a reviewed tap change.
Repository IDs are verified against OIDC for each request but not stored between
updates; detecting deletion/recreation of the same-named source is not provided.

## Send a recipe from upstream CI

1. Run a release workflow on the version tag, using `push`, `release`, or
   `workflow_dispatch` on that tag. The tag commit must match the CI commit.
2. Build/upload all application assets and publish the non-draft GitHub Release.
3. Generate the complete Formula or Cask with actual asset SHA256 values.
4. Request an OIDC token bound to this update, then dispatch the recipe to the tap.

The Ruby helper `scripts/notify-package-update.rb` implements step 4. Copy it to
the upstream project; it uses only standard Ruby libraries. For example:

```yaml
permissions:
    contents: read
    id-token: write

steps:
    # Checkout, build, publish the Release and generate the recipe first.
    - name: Notify Homebrew tap
      env:
          GH_TOKEN: ${{ secrets.HOMEBREW_TAP_TOKEN }}
          TAP_REPOSITORY: owner/homebrew-tap
          PACKAGE: tool
          TAG: ${{ github.ref_name }}
          RECIPE_PATH: packaging/tool.rb
      run: ruby scripts/notify-package-update.rb
```

`GH_TOKEN` is a token authorized to dispatch to the target tap (Contents
read/write), not the upstream's default `GITHUB_TOKEN`. Prefer a short-lived
GitHub App installation token. Dispatch permission is not dispatch-only: protect
this credential because it may also allow repository writes. `id-token: write`
is needed on the upstream job; the tap does not need to mint an OIDC token.

The workflow's language/runtime setup is the upstream project's responsibility.
For release events, `github.ref_name` must identify the release tag. Manual runs
must explicitly select that tag, not the default branch.

The helper sends:

```json
{
	"event_type": "update-package",
	"client_payload": {
		"repository": "owner/tool",
		"package": "tool",
		"tag": "v1.2.0",
		"recipe": "class Tool < Formula\n  ...\nend\n",
		"identity_token": "<GitHub Actions OIDC JWT>"
	}
}
```

Never print the token or full request body. A successful dispatch means queued,
not published. OIDC tokens are short-lived: if the tap is queued until the token
expires, send a fresh notification from upstream CI. Rerunning the tap alone
cannot renew an expired token.

## Recipe requirements

- Ordinary top-level `class Tool < Formula` or `cask "tool" do` declaration.
- Exactly one explicit `  version "..."` stanza matching the tag without `v`.
- Supported tags: optional `v`, `MAJOR.MINOR.PATCH`, optionally `-beta.N` or
  `-rc.N`. Other Homebrew version formats are not supported by this protocol yet.
- UTF-8, no NUL bytes, at most 32 KiB. The helper also checks the JSON-encoded
  payload against GitHub's dispatch size limit, including escaping and the JWT.
- Real SHA256 values; `:no_check` is not supported.
- Formulae must install and test on macOS and Linux. Casks test on macOS.
- Package names are restricted safe tokens; the tap computes the target path.
  Same-name cross-type recipes and symlinks are rejected.

A minimal structure is:

```ruby
class Tool < Formula
  desc "Example command-line tool"
  homepage "https://github.com/owner/tool"
  version "1.2.0"
  url "https://github.com/owner/tool/releases/download/v1.2.0/tool.tar.gz"
  sha256 "<actual 64-character SHA256>"

  def install
    bin.install "tool"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/tool --version")
  end
end
```

The tap preserves recipe bytes, including comments. The upstream selects the
release to publish; the direct protocol does not require GitHub's latest release.
Downgrades and same-version content replacement are rejected. Identical repeat
requests are no-ops. Use a new version or reviewed tap commit for corrections.

## Identity protocol

Custom senders must reproduce the helper's audience calculation exactly. Compute
SHA256 over the UTF-8 bytes of the recipe, then serialize this fixed-order array
as compact JSON (without a trailing newline):

```text
["v1", lower(target tap), lower(source repository), package, tag, recipe SHA256]
```

Hash those JSON bytes. Request the OIDC audience:

```text
homebrew-update:v1:<lowercase target tap>:<request SHA256>
```

This binds the GitHub-signed token to the target, source, package, tag and exact
recipe. The tap checks the pinned issuer/JWKS, RS256 signature, audience, lifetime,
repository ID, tag/ref, workflow identity, run attempt and commit. GitHub API calls
confirm the repository, tag commit and CI run. Reusable workflow calls retain the
calling repository's identity; the shared workflow's repository does not become
the package source. Private upstreams require additional read access and are not
supported by the default tap token configuration.

At preparation the token must be currently valid. After installation tests it may
have expired normally. The publisher revalidates its signature/content at the
successful preparation step's completion time, fetched from GitHub's jobs API for
this exact tap run attempt. It never trusts an artifact's self-reported timestamp
or `verified` flag. An expired-at-preparation token remains invalid. Signing-key
rotation that removes the original key fails closed and requires a fresh dispatch.

## Existing notification compatibility

Existing publishers can keep sending:

```json
{
	"event_type": "update-package",
	"client_payload": { "package": "tool", "tag": "v1.2.0" }
}
```

Without a `recipe` field, the tap uses its reviewed legacy configuration and
original assets/generator/version policy. This path cannot introduce new packages
and retains its existing dispatch-token trust model; it does not claim OIDC proof.
Manual **Update package** runs with package/tag use this same legacy path.

With a `recipe` field, OIDC is mandatory. Empty, invalid or unauthenticated recipes
fail rather than silently falling back. The tap never downloads a release rb as
an alternate source. New publishers do not need a legacy registration.

## Testing and publication

The preparation job treats rb as data. Only the disposable Homebrew test runners
execute it, with read-only contents permission, no persisted checkout credentials,
and no publishing/deploy secrets. Formulae install and run `brew test`; declared
services receive an info check. Casks run style, audit, fetch, install, list and
uninstall. Actual package identity, version and SHA256 are checked through
Homebrew metadata. **Homebrew and installers execute code, not a security sandbox.**
Authorize only trusted maintainers and do not use self-hosted runners.

The publisher alone has write permission. It runs the latest default branch's
trusted scripts, rechecks identity, authorization, tag/Release/assets and candidate
SHA256, and commits only the rb. Different-package Git conflicts
are retried against the latest branch without overwriting unrelated files; changes
to the same recipe stop publication and require a fresh update. Replaying a signed
request cannot replace a newer version. Concurrency is not a durable queue; resend
the latest release if a waiting notification is replaced.

Keep the workflow name **Update package** for the existing Cloudflare
`workflow_run` integration. Website failures do not undo published recipes.

## Local checks

```sh
gem install jwt --version 2.10.2 --no-document
ruby scripts/package-update.test.rb
node --test scripts/*.test.mjs scripts/packages/*.test.mjs scripts/catalog/*.test.mjs
ruby -c scripts/package-update.rb
ruby -c scripts/package-update-auth.rb
ruby -c scripts/package-update-legacy.rb
ruby -c scripts/notify-package-update.rb
```

The Ruby suite also runs in **Check tap** and before candidate preparation.
