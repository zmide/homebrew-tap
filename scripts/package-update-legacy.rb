# frozen_string_literal: true

module PackageUpdate
  # Compatibility registrations apply only to notifications without a recipe.
  # New publishers never need an entry here.
  LEGACY = {
    "oci-mirror-proxy" => {
      "repository" => "runui/oci-mirror-proxy", "channel" => "stable",
      "legacy" => { "type" => "local-generator", "script" => "scripts/packages/oci-mirror-proxy.mjs", "checksumAsset" => "SHA256SUMS" }
    },
    "squirrel" => {
      "repository" => "PBK-B/squirrel", "channel" => "prerelease",
      "legacy" => { "type" => "single-pkg", "asset" => 'Squirrel-.*\.pkg', "minimum" => "1.1.2-beta.5", "previousVersion" => "1.1.2-beta5" }
    }
  }.freeze

  def self.legacy_recipe(api, release, text, config, tag, directory, root)
    legacy = config["legacy"]
    ensure!(legacy, "Missing legacy adapter")
    if legacy["type"] == "local-generator"
      script = root.join(legacy.fetch("script"))
      ensure!(script.file? && !script.symlink? && !script.parent.symlink?, "Missing trusted generator")
      sums = directory.join("SHA256SUMS")
      sums.binwrite(api.download(release, legacy.fetch("checksumAsset"), limit: 1024 * 1024))
      output = directory.join("generated.rb")
      ensure!(system("node", script.to_s, tag, sums.to_s, output.to_s), "Legacy generator failed")
      return output.read
    end
    pattern = Regexp.new("\\A(?:#{legacy.fetch('asset')})\\z")
    names = release.fetch("assets").map { |item| item["name"] }.select { |name| pattern.match?(name) }
    ensure!(names.length == 1 && /\A[A-Za-z0-9][A-Za-z0-9._-]*\.pkg\z/.match?(names.first), "Expected one safe pkg asset")
    name = names.first
    checksum = api.download(release, name, limit: 512 * 1024 * 1024, destination: directory.join("package.pkg"))
    url = "https://github.com/#{api.repository}/releases/download/#{escape(tag)}/#{escape(name)}"
    [
      [/^  version "[^"\n]+"$/, "  version \"#{tag.delete_prefix('v')}\""],
      [/^  sha256 "[a-f0-9]{64}"$/, "  sha256 \"#{checksum}\""],
      [/^  url "[^"\n]+"$/, "  url \"#{url}\""],
      [/^  pkg "[^"\n]+"$/, "  pkg \"#{name}\""]
    ].each do |regex, replacement|
      ensure!(text.scan(regex).length == 1, "Unsupported legacy recipe structure")
      text = text.sub(regex) { replacement }
    end
    text
  end

end
