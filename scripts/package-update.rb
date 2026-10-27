# frozen_string_literal: true

require "digest"
require "fileutils"
require "json"
require "net/http"
require "pathname"
require "rubygems/version"
require "uri"

# This module treats release recipes as data. Only the unprivileged brew job loads Ruby.
module PackageUpdate
  TOKEN = /\A[a-z0-9]+(?:[a-z0-9+._-]*[a-z0-9+])?\z/
  REPOSITORY = %r{\A[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*\z}
  SEMVER = /\Av?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:beta|rc)\.(0|[1-9]\d*))?\z/

  def self.ensure!(condition, message)
    raise ArgumentError, message unless condition
  end

  def self.version(value, channel, tag: false)
    ensure!(value.is_a?(String) && SEMVER.match?(value), "Expected SemVer, optionally beta.N or rc.N")
    parsed = Gem::Version.new(value.delete_prefix("v"))
    if channel == "stable"
      ensure!(!parsed.prerelease? && (!tag || value.start_with?("v")), "Stable channel requires vMAJOR.MINOR.PATCH tags")
    end
    parsed
  end

  def self.recipe_kind(text, package)
    casks = text.scan(/^cask "([^"\n]+)" do$/).flatten
    formulae = text.scan(/^class ([A-Za-z][A-Za-z0-9]*) < Formula$/).flatten
    ensure!([[1, 0], [0, 1]].include?([casks.length, formulae.length]), "Unsupported recipe declaration")
    unless casks.empty?
      ensure!(casks == [package], "Cask token mismatch")
      return "cask"
    end
    "formula"
  end

  def self.recipe_version(text)
    versions = text.scan(/^  version "([^"\n]+)"$/).flatten
    ensure!(versions.length == 1, "Expected one explicit version stanza")
    versions.first
  end

  def self.existing(root, package)
    paths = %w[Formula Casks Cask].map { |dir| root.join(dir, "#{package}.rb") }
    paths.each { |path| ensure!(!path.symlink? && !path.parent.symlink?, "Symlink recipes are not supported") }
    found = paths.select(&:exist?)
    ensure!(found.length <= 1, "Package exists in multiple recipe directories")
    found.first
  end

  class GitHub
    attr_reader :repository

    def initialize(repository)
      @repository = repository
    end

    # Tokens go only to the GitHub API, never to asset redirects/CDNs.
    def request(url, limit:, authenticated: false, redirects: 5, &consumer)
      uri = URI(url)
      PackageUpdate.ensure!(uri.is_a?(URI::HTTPS) && !uri.userinfo, "Unsafe URL")
      headers = { "Accept" => authenticated ? "application/vnd.github+json" : "application/octet-stream", "User-Agent" => "homebrew-tap-updater" }
      headers["Authorization"] = "Bearer #{ENV.fetch('GH_TOKEN')}" if authenticated
      Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 30, read_timeout: 180) do |http|
        http.request(Net::HTTP::Get.new(uri, headers)) do |response|
          if response.is_a?(Net::HTTPRedirection)
            PackageUpdate.ensure!(redirects.positive? && !authenticated, "Unexpected API redirect or too many redirects")
            PackageUpdate.ensure!(response["location"], "Missing redirect location")
            return request(URI.join(url, response["location"]).to_s, limit: limit, redirects: redirects - 1, &consumer)
          end
          PackageUpdate.ensure!(response.is_a?(Net::HTTPSuccess), "HTTP #{response.code}: #{uri.host}#{uri.path}")
          size = 0
          response.read_body do |chunk|
            size += chunk.bytesize
            PackageUpdate.ensure!(size <= limit, "Oversized download")
            consumer.call(chunk)
          end
        end
      end
    end

    def api(path)
      data = +""
      suffix = path.empty? ? "" : "/#{path}"
      request("https://api.github.com/repos/#{repository}#{suffix}", limit: 16 * 1024 * 1024, authenticated: true) { |chunk| data << chunk }
      JSON.parse(data)
    end

    def asset(release, name)
      assets = release.fetch("assets").select { |item| item["name"] == name }
      PackageUpdate.ensure!(assets.length == 1, "Expected exactly one #{name} asset")
      item = assets.first
      url = "https://github.com/#{repository}/releases/download/#{PackageUpdate.escape(release.fetch('tag_name'))}/#{PackageUpdate.escape(name)}"
      PackageUpdate.ensure!(item["state"] == "uploaded" && item["size"].is_a?(Integer) && item["size"].positive?, "Incomplete asset")
      PackageUpdate.ensure!(item["browser_download_url"] == url, "Unexpected asset URL")
      item
    end

    def download(release, name, limit:, destination: nil)
      item = asset(release, name)
      PackageUpdate.ensure!(item["size"] <= limit, "Asset too large")
      digest = Digest::SHA256.new
      data = +""
      size = 0
      file = File.open(destination, "wb") if destination
      begin
        request(item.fetch("browser_download_url"), limit: limit) do |chunk|
          size += chunk.bytesize
          digest.update(chunk)
          file ? file.write(chunk) : data << chunk
        end
      ensure
        file&.close
      end
      PackageUpdate.ensure!(size == item["size"], "Incomplete download")
      PackageUpdate.ensure!(!item["digest"] || item["digest"] == "sha256:#{digest.hexdigest}", "Asset digest mismatch")
      destination ? digest.hexdigest : data
    end

    def current?(tag, config)
      requested = PackageUpdate.version(tag, config.fetch("channel"), tag: true)
      return api("releases/latest")["tag_name"] == tag if config["channel"] == "stable"

      candidates = []
      page = 1
      loop do
        releases = api("releases?per_page=100&page=#{page}")
        releases.each do |release|
          next if release["draft"]
          begin
            parsed = PackageUpdate.version(release["tag_name"], config["channel"], tag: true)
          rescue ArgumentError
            next
          end
          minimum = config.fetch("legacy", {}).fetch("minimum", "0.0.0")
          candidates << [parsed, release["tag_name"]] if parsed >= PackageUpdate.version(minimum, "prerelease")
        end
        break if releases.length < 100
        page += 1
      end
      !candidates.empty? && candidates.max == [requested, tag]
    end
  end

  def self.escape(value)
    URI.encode_www_form_component(value).gsub("+", "%20")
  end

  def self.no_downgrade!(text, config, requested)
    previous = recipe_version(text)
    legacy = config.fetch("legacy", {})
    if previous == legacy["previousVersion"]
      ensure!(legacy["minimum"] && requested >= version(legacy["minimum"], config["channel"]), "Refusing historical downgrade")
      return
    end
    ensure!(version(previous, config["channel"]) <= requested, "Refusing downgrade")
  end

  def self.validate_info(info, package, kind, expected_version)
    records = info.fetch(kind == "cask" ? "casks" : "formulae")
    ensure!(records.length == 1, "Expected one Homebrew record")
    record = records.first
    ensure!((kind == "cask" ? record["token"] : record["name"]) == package, "Homebrew package mismatch")
    actual = kind == "cask" ? record["version"] : record.fetch("versions")["stable"]
    ensure!(actual == expected_version, "Homebrew version mismatch")
    checksum = kind == "cask" ? record["sha256"] : record.dig("urls", "stable", "checksum")
    ensure!(checksum.is_a?(String) && /\A[a-f0-9]{64}\z/.match?(checksum), "Real SHA256 required")
  end

  def self.request_from_event(event, event_name)
    payload = event_name == "repository_dispatch" ? event.fetch("client_payload") : event.fetch("inputs")
    ensure!(payload.is_a?(Hash), "Invalid request")
    # Presence, not truthiness: malformed direct requests must never enter legacy mode.
    direct = payload.key?("recipe")
    ensure!(!direct || event_name == "repository_dispatch", "Direct recipes require an upstream OIDC dispatch")
    package, tag = payload.values_at("package", "tag")
    ensure!(package.is_a?(String) && TOKEN.match?(package), "Invalid package")
    version(tag, "prerelease", tag: true)
    if direct
      ensure!(payload["repository"].is_a?(String) && REPOSITORY.match?(payload["repository"]), "Invalid source repository")
      text = payload["recipe"]
      ensure!(text.is_a?(String) && text.encoding == Encoding::UTF_8 && text.valid_encoding? && text.bytesize.between?(1, 32 * 1024) && !text.include?("\0"), "Invalid recipe; maximum 32 KiB UTF-8")
      ensure!(payload["identity_token"].is_a?(String), "Missing OIDC token")
    else
      config = LEGACY[package]
      ensure!(config, "Unknown legacy package; send recipe with OIDC")
      ensure!(payload["repository"].to_s.empty? || payload["repository"].casecmp?(config.fetch("repository")), "Legacy source mismatch")
      payload = payload.merge("repository" => config.fetch("repository"))
    end
    payload.merge("mode" => direct ? "direct" : "legacy")
  end

  def self.snapshot(release)
    release.fetch("assets").map { |item| item.slice("id", "name", "size", "updated_at", "digest", "state") }.sort_by { |item| item.fetch("id") }
  end

  def self.comparison_policy(package, direct)
    config = LEGACY.fetch(package, { "channel" => "prerelease" })
    # Direct publishers choose their release channel; legacy latest-selection
    # rules must not prevent a later direct update after accepting a prerelease.
    direct ? config.merge("channel" => "prerelease") : config
  end

  def self.prepare(root, directory, request, client: nil, keys: nil)
    package, tag, repository = request.values_at("package", "tag", "repository")
    api = client || GitHub.new(repository)
    direct = request.fetch("mode") == "direct"
    config = direct ? { "channel" => "prerelease" } : LEGACY.fetch(package)
    if direct
      claims = verify_identity(request, tap: ENV.fetch("GITHUB_REPOSITORY"), keys: keys)
      identity = verify_upstream!(api, request, claims)
      text = request.fetch("recipe")
      kind = recipe_kind(text, package)
      authorize!(root, request, kind, text: text)
    else
      version(tag, config.fetch("channel"), tag: true)
      return { "current" => "false" } unless api.current?(tag, config)
      identity = api.api("").fetch("id")
    end
    release = api.api("releases/tags/#{escape(tag)}")
    ensure!(!release["draft"] && release["tag_name"] == tag, "Release unavailable")
    previous_path = existing(root, package)
    previous = previous_path&.binread
    unless direct
      ensure!(previous, "Legacy update requires an existing recipe")
      text = legacy_recipe(api, release, previous, config, tag, directory, root)
      kind = recipe_kind(text, package)
      authorize!(root, request, kind)
    end
    normalized = tag.delete_prefix("v")
    ensure!(recipe_version(text) == normalized, "Recipe version does not match tag")
    target = "#{kind == 'cask' ? 'Casks' : 'Formula'}/#{package}.rb"
    if previous
      ensure!(previous_path.relative_path_from(root).to_s == target, "Cannot change package type/path")
      no_downgrade!(previous, comparison_policy(package, direct), version(tag, "prerelease"))
      if recipe_version(previous) == normalized
        # Legacy generators may differ only in historical generated comments.
        # Preserve their original idempotency without permitting direct replacement.
        ensure!(!direct || previous == text, "Same version has different content; publish a new version")
        return { "current" => "false" }
      end
    end
    candidate = {
      "mode" => request.fetch("mode"), "package" => package, "tag" => tag,
      "repository" => repository, "repositoryId" => identity, "recipe" => target,
      "kind" => kind, "version" => normalized, "releaseId" => release.fetch("id"),
      "sha256" => Digest::SHA256.hexdigest(text),
      "previousSha256" => previous && Digest::SHA256.hexdigest(previous),
      "assets" => snapshot(release)
    }
    directory.join("recipe.rb").binwrite(text)
    directory.join("candidate.json").write(JSON.generate(candidate))
    candidate.merge("current" => "true", "matrix" => JSON.generate(kind == "cask" ? ["macos-15"] : ["macos-15", "ubuntu-latest"]))
  end

  def self.check(root, directory, request, client: nil, keys: nil, authenticated_at: nil)
    candidate = JSON.parse(directory.join("candidate.json").read)
    text = directory.join("recipe.rb").binread
    %w[mode package tag repository].each { |key| ensure!(candidate[key] == request[key], "Candidate request mismatch") }
    ensure!(Digest::SHA256.hexdigest(text) == candidate.fetch("sha256"), "Candidate modified after preparation")
    package, tag, repository = request.values_at("package", "tag", "repository")
    direct = request.fetch("mode") == "direct"
    api = client || GitHub.new(repository)
    if direct
      # Re-read the original GitHub event, not a copied JWT or 'verified' artifact.
      # Historical verification is bounded by GitHub's successful prepare step.
      ensure!(request.fetch("recipe").b == text, "Candidate differs from authenticated event")
      claims = verify_identity(request, tap: ENV.fetch("GITHUB_REPOSITORY"), at: authenticated_at || prepared_at, keys: keys)
      identity = verify_upstream!(api, request, claims)
    else
      identity = api.api("").fetch("id")
      return false unless api.current?(tag, LEGACY.fetch(package))
    end
    ensure!(identity == candidate.fetch("repositoryId"), "Source identity changed")
    kind = recipe_kind(text, package)
    ensure!(kind == candidate.fetch("kind") && recipe_version(text) == tag.delete_prefix("v"), "Candidate identity/version mismatch")
    target = "#{kind == 'cask' ? 'Casks' : 'Formula'}/#{package}.rb"
    ensure!(target == candidate.fetch("recipe"), "Unsafe candidate target")
    authorize!(root, request, kind, text: direct ? text : nil)
    path = existing(root, package)
    previous = path&.binread
    if path
      ensure!(path.relative_path_from(root).to_s == target, "Cannot change package type/path")
      ensure!(previous == text || Digest::SHA256.hexdigest(previous) == candidate["previousSha256"], "Package changed during testing; rerun")
      no_downgrade!(previous, comparison_policy(package, direct), version(tag, "prerelease"))
    else
      ensure!(candidate["previousSha256"].nil?, "Package removed during testing")
    end
    release = api.api("releases/tags/#{escape(tag)}")
    ensure!(!release["draft"] && release["tag_name"] == tag && release["id"] == candidate["releaseId"], "Release changed during testing")
    ensure!(snapshot(release) == candidate.fetch("assets"), "Release assets changed during testing")
    true
  end

  def self.main
    command = ARGV.fetch(0)
    if command == "validate-info"
      validate_info(JSON.parse(File.read(ARGV.fetch(1))), ENV.fetch("PACKAGE"), ENV.fetch("KIND"), ENV.fetch("VERSION"))
      return
    end
    event = JSON.parse(File.read(ENV.fetch("GITHUB_EVENT_PATH")))
    request = request_from_event(event, ENV.fetch("GITHUB_EVENT_NAME"))
    root = Pathname.pwd
    directory = Pathname.new(ENV.fetch("CANDIDATE_DIR") { File.join(ENV.fetch("RUNNER_TEMP"), "candidate") })
    directory.mkpath
    case command
    when "prepare"
      outputs = prepare(root, directory, request)
      File.open(ENV.fetch("GITHUB_OUTPUT"), "a") do |file|
        %w[current recipe kind version matrix].each do |key|
          value = outputs.fetch(key, "")
          ensure!(!value.match?(/[\r\n]/), "Unsafe workflow output")
          file.puts("#{key}=#{value}")
        end
      end
    when "check"
      exit 3 unless check(root, directory, request)
    else
      raise ArgumentError, "Unknown command"
    end
  end
end

require_relative "package-update-legacy"
require_relative "package-update-auth"

if $PROGRAM_NAME == __FILE__
  begin
    PackageUpdate.main
  rescue StandardError => error
    # Never dump a JWT, request body or library exception containing credentials.
    warn "Package update failed (#{error.class}); #{error.is_a?(ArgumentError) ? error.message : 'check inputs, identity, and GitHub API availability'}"
    exit 1
  end
end
