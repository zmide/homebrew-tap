# Homebrew Tap

Homebrew packages maintained by zmide. Release binaries remain in each
application's upstream GitHub repository.

## Install

```sh
brew install zmide/tap/oci-mirror-proxy
```

To update:

```sh
brew update
brew upgrade zmide/tap/oci-mirror-proxy
```

## Automated updates

The `Update package` workflow accepts `repository_dispatch` events of type
`update-package`, or can be run manually with a package name and stable release
tag. Only registered packages and the upstream's latest stable release are
accepted. Generated formulae are installed and tested on macOS and Linux before
being committed. Concurrent updates retry against the latest default branch.

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

Upstream workflows need a fine-grained token with access only to this repository
and `Contents: Read and write` permission to send dispatch events. The tap uses
its own `GITHUB_TOKEN` to commit; repository rules must permit those commits.
A successful dispatch means the update was queued, not that installation tests
or publication succeeded. Check this repository's Actions for results and rerun
failed updates manually.

## Add a package

Register its upstream repository and generator in `scripts/select-package.mjs`,
add it to the manual workflow's package choices, and provide a generator and
tests. Generators must accept a tag, checksum file, and output path. Each package
defines its own installation and test behavior in its formula. Upstream
workflows should notify this repository only after all release assets are ready.

Run generator tests with Node.js 24:

```sh
node --test scripts/*.test.mjs
```
