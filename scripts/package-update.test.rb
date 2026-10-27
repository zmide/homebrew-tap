# frozen_string_literal: true

require "minitest/autorun"
require "tmpdir"
require "openssl"
require_relative "package-update"
require_relative "notify-package-update"

class PackageUpdateTest < Minitest::Test
  def setup
    @tmp = Dir.mktmpdir("tap-update-")
    @root = Pathname.new(@tmp).join("tap")
    @directory = Pathname.new(@tmp).join("candidate")
    @root.join(".github").mkpath
    @directory.mkpath
    @saved = ENV.to_h.slice("GITHUB_REPOSITORY", "HOMEBREW_UPDATE_TRUST")
    ENV["GITHUB_REPOSITORY"] = "owner/homebrew-tap"
    ENV["HOMEBREW_UPDATE_TRUST"] = '["owner"]'
    @key = OpenSSL::PKey::RSA.generate(2048)
    @jwk = JWT::JWK.new(@key, "test-key")
    @keys = { keys: [@jwk.export] }
    @request = {
      "repository" => "owner/tool", "package" => "tool", "tag" => "v1.2.0",
      "recipe" => recipe, "mode" => "direct"
    }
    @now = Time.now.to_i
    @claims = {
      "iss" => PackageUpdate::ISSUER, "aud" => PackageUpdate.audience(@request, ENV.fetch("GITHUB_REPOSITORY")),
      "iat" => @now - 10, "nbf" => @now - 10, "exp" => @now + 290,
      "repository" => "owner/tool", "repository_id" => "42", "run_id" => "12", "run_attempt" => "1",
      "sha" => "a" * 40, "ref" => "refs/tags/v1.2.0", "ref_type" => "tag", "event_name" => "release",
      "workflow_ref" => "owner/tool/.github/workflows/release.yml@refs/tags/v1.2.0"
    }
    sign
    @api = FakeGitHub.new
  end

  def teardown
    %w[GITHUB_REPOSITORY HOMEBREW_UPDATE_TRUST].each { |key| ENV[key] = @saved[key] }
    FileUtils.remove_entry(@tmp)
  end

  class FakeGitHub
    attr_accessor :identity, :sha, :release, :latest
    def initialize
      @identity = 42
      @sha = "a" * 40
      @latest = true
      @release = { "id" => 10, "tag_name" => "v1.2.0", "draft" => false,
                   "assets" => [{ "id" => 20, "name" => "tool.tar.gz", "size" => 10, "state" => "uploaded" }] }
    end
    def api(path)
      return { "id" => identity } if path.empty?
      return { "sha" => sha } if path.start_with?("commits/")
      return { "repository" => { "id" => identity }, "head_sha" => sha, "run_attempt" => 1 } if path.start_with?("actions/runs/")
      release
    end
    def current?(_tag, _config)
      latest
    end
  end

  def recipe(v = "1.2.0")
    "class Tool < Formula\n  version \"#{v}\"\n  url \"https://github.com/owner/tool/releases/download/v#{v}/tool.tar.gz\"\n  sha256 \"#{'a' * 64}\"\nend\n"
  end

  def sign
    @request["identity_token"] = JWT.encode(@claims, @key, "RS256", kid: @jwk.kid)
  end

  def prepare
    PackageUpdate.prepare(@root, @directory, @request, client: @api, keys: @keys)
  end

  def check
    PackageUpdate.check(@root, @directory, @request, client: @api, keys: @keys, authenticated_at: @now)
  end

  def previous(text = recipe("1.1.0"), repository = "owner/tool")
    @root.join("Formula").mkpath
    @root.join("Formula/tool.rb").write(text.gsub("github.com/owner/tool/", "github.com/#{repository}/"))
  end

  def verify
    PackageUpdate.verify_identity(@request, tap: ENV.fetch("GITHUB_REPOSITORY"), at: @now, keys: @keys)
  end

  def test_valid_identity_and_request_binding
    assert_equal "owner/tool", verify.fetch("repository")
    @request["recipe"] += "# substitution\n"
    assert_raises(JWT::InvalidAudError) { verify }
  end

  def test_algorithm_and_signature_are_enforced
    @request["identity_token"] = JWT.encode(@claims, nil, "none")
    assert_raises(JWT::DecodeError) { verify }
    @request["identity_token"] = JWT.encode(@claims, OpenSSL::PKey::RSA.generate(2048), "RS256", kid: @jwk.kid)
    assert_raises(JWT::DecodeError) { verify }
  end

  def test_expiry_future_and_issuer
    @claims["exp"] = @now - 1
    sign
    assert_raises(ArgumentError) { verify }
    @claims["exp"] = @now + 290
    @claims["nbf"] = @now + 100
    sign
    assert_raises(ArgumentError) { verify }
    @claims["nbf"] = @now - 10
    @claims["iss"] = "https://evil.example"
    sign
    assert_raises(JWT::InvalidIssuerError) { verify }
  end

  def test_claims_must_describe_release_ci
    { "repository" => "evil/tool", "ref" => "refs/heads/main", "event_name" => "pull_request", "workflow_ref" => "evil/tool/.github/workflows/a.yml@refs/tags/v1.2.0", "repository_id" => "bad" }.each do |key, value|
      old = @claims[key]
      @claims[key] = value
      sign
      assert_raises(ArgumentError, key) { verify }
      @claims[key] = old
    end
  end

  def test_historical_signature_verification
    assert PackageUpdate.verify_identity(@request, tap: ENV.fetch("GITHUB_REPOSITORY"), at: @now, keys: @keys)
    assert_raises(ArgumentError) { PackageUpdate.verify_identity(@request, tap: ENV.fetch("GITHUB_REPOSITORY"), at: @now + 1000, keys: @keys) }
  end

  def test_simple_env_patterns
    %w[owner owner/* owner/tool OWNER/TOOL].each { |entry| assert PackageUpdate.trusted?("owner/tool", JSON.generate([entry])) }
    refute PackageUpdate.trusted?("evil/tool", '["owner"]')
    refute PackageUpdate.trusted?("owner/tool", "")
    ['{}', '["*/tool"]', '["owner/t*"]', '[1]'].each { |raw| assert_raises(ArgumentError) { PackageUpdate.trusted?("owner/tool", raw) } }
  end

  def test_new_package_and_raw_bytes
    assert_equal "true", prepare.fetch("current")
    assert_equal @request["recipe"].b, @directory.join("recipe.rb").binread
    assert check
    refute @root.join(".github/package-sources.json").exist?
  end

  def test_existing_package_does_not_need_env
    previous
    ENV["HOMEBREW_UPDATE_TRUST"] = ""
    assert_equal "true", prepare.fetch("current")
    assert check
  end

  def test_unknown_sources_and_unidentifiable_existing_source
    ENV["HOMEBREW_UPDATE_TRUST"] = "[]"
    assert_raises(ArgumentError) { prepare }
    previous(recipe("1.1.0").sub("https://github.com/owner/tool/releases/download/", "https://example.com/"))
    assert_raises(ArgumentError) { prepare }
  end

  def test_literal_release_sources_and_ambiguous_urls
    assert_equal "owner/tool", PackageUpdate.recipe_source(recipe)
    interpolated = '  url "https://github.com/Owner/Tool/releases/download/v#{version}/tool.tar.gz"'
    assert_equal "owner/tool", PackageUpdate.recipe_source(interpolated)
    [
      '  url "https://github.com/#{owner}/tool/releases/download/v1/a.tgz"',
      '  url "https://example.com/tool.tgz"',
      recipe + '  url "https://github.com/other/tool/releases/download/v1/a.tgz"'
    ].each { |text| assert_raises(ArgumentError) { PackageUpdate.recipe_source(text) } }
    @request["recipe"] = recipe.gsub("github.com/owner/tool/", "github.com/other/tool/")
    @claims["aud"] = PackageUpdate.audience(@request, ENV.fetch("GITHUB_REPOSITORY"))
    sign
    assert_raises(ArgumentError) { prepare }
  end

  def test_fixed_source_and_repository_id
    previous(recipe("1.1.0"), "other/tool")
    assert_raises(ArgumentError) { prepare }
    @api.identity = 99
    assert_raises(ArgumentError) { prepare }
    @api.identity = 42
    previous
    @api.sha = "b" * 40
    assert_raises(ArgumentError) { prepare }
  end

  def test_authorization_revocation_and_tampering
    prepare
    ENV["HOMEBREW_UPDATE_TRUST"] = "[]"
    assert_raises(ArgumentError) { check }
    ENV["HOMEBREW_UPDATE_TRUST"] = '["owner"]'
    @directory.join("recipe.rb").write(recipe + "# tampered\n")
    assert_raises(ArgumentError) { check }
  end

  def test_release_and_same_package_concurrency
    previous
    prepare
    @api.release["assets"][0]["id"] = 21
    assert_raises(ArgumentError) { check }
    @api.release["assets"][0]["id"] = 20
    previous(recipe("1.1.0") + "# review\n")
    assert_raises(ArgumentError) { check }
  end

  def test_replay_is_idempotent
    prepare
    assert check
    @root.join("Formula").mkpath
    @root.join("Formula/tool.rb").binwrite(@directory.join("recipe.rb").binread)
    assert check
    assert_equal "false", prepare.fetch("current")
  end

  def test_version_and_same_version_mutations
    assert_operator PackageUpdate.version("1.2.0-beta.10", "prerelease"), :>, PackageUpdate.version("1.2.0-beta.2", "prerelease")
    assert_operator PackageUpdate.version("1.2.0", "prerelease"), :>, PackageUpdate.version("1.2.0-rc.1", "prerelease")
    previous(recipe("2.0.0"))
    assert_raises(ArgumentError) { prepare }
    previous(recipe + "# different\n")
    assert_raises(ArgumentError) { prepare }
  end

  def test_mode_presence_and_legacy_source
    event = { "client_payload" => { "package" => "squirrel", "tag" => "1.1.2-beta.5" } }
    result = PackageUpdate.request_from_event(event, "repository_dispatch")
    assert_equal "legacy", result["mode"]
    assert_equal "PBK-B/squirrel", result["repository"]
    event["client_payload"]["recipe"] = nil
    assert_raises(ArgumentError) { PackageUpdate.request_from_event(event, "repository_dispatch") }
    %w[../evil tool/path].each do |name|
      assert_raises(ArgumentError) { PackageUpdate.request_from_event({ "client_payload" => @request.merge("package" => name) }, "repository_dispatch") }
    end
  end

  def test_symlink_and_type_collision
    @root.join("Formula").make_symlink(@directory)
    assert_raises(ArgumentError) { prepare }
    @root.join("Formula").delete
    @root.join("Casks").mkpath
    @root.join("Casks/tool.rb").write("cask \"tool\" do\n  version \"1.1.0\"\nend\n")
    assert_raises(ArgumentError) { prepare }
  end

  def test_legacy_generator_and_historical_migration
    root = Pathname.new(__dir__).parent
    config = PackageUpdate::LEGACY.fetch("oci-mirror-proxy")
    api = Object.new
    sums = %w[darwin_arm64 darwin_amd64 linux_arm64 linux_amd64].map { |p| "#{'a' * 64}  oci-mirror-proxy_v1.2.0_#{p}.tar.gz" }.join("\n")
    api.define_singleton_method(:download) { |*_, **_| sums }
    text = PackageUpdate.legacy_recipe(api, {}, "", config, "v1.2.0", @directory, root)
    assert_equal "1.2.0", PackageUpdate.recipe_version(text)
    assert_includes text, "service do"
    historical = root.join("Casks/squirrel.rb").read
    config = PackageUpdate::LEGACY.fetch("squirrel")
    PackageUpdate.no_downgrade!(historical, config, PackageUpdate.version("1.1.2-beta.5", "prerelease"))
    assert_raises(ArgumentError) { PackageUpdate.no_downgrade!(historical, config, PackageUpdate.version("1.0.0", "prerelease")) }
  end

  def test_homebrew_info_checksum
    info = { "formulae" => [{ "name" => "tool", "versions" => { "stable" => "1.2.0" }, "urls" => { "stable" => { "checksum" => "a" * 64 } } }] }
    PackageUpdate.validate_info(info, "tool", "formula", "1.2.0")
    assert_raises(ArgumentError) { PackageUpdate.validate_info(info, "wrong", "formula", "1.2.0") }
    info["formulae"][0]["urls"]["stable"]["checksum"] = "no_check"
    assert_raises(ArgumentError) { PackageUpdate.validate_info(info, "tool", "formula", "1.2.0") }
  end

  def test_prepare_time_comes_from_successful_github_step
    saved = ENV.to_h.slice("GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT")
    ENV["GITHUB_RUN_ID"] = "123"
    ENV["GITHUB_RUN_ATTEMPT"] = "2"
    expected = "actions/runs/123/attempts/2/jobs?per_page=100&page=1"
    response = { "jobs" => [{ "name" => "generate", "conclusion" => "success", "steps" => [{ "name" => "Select release and prepare candidate", "conclusion" => "success", "completed_at" => "2026-10-27T00:00:00Z" }] }] }
    fake = Object.new
    fake.define_singleton_method(:api) { |path| raise "Wrong run attempt" unless path == expected; response }
    PackageUpdate::GitHub.stub(:new, fake) do
      assert_equal Time.iso8601("2026-10-27T00:00:00Z").to_i, PackageUpdate.prepared_at
      response["jobs"][0]["steps"][0]["conclusion"] = "failure"
      assert_raises(ArgumentError) { PackageUpdate.prepared_at }
    end
  ensure
    saved.each_key { |key| ENV[key] = saved[key] }
    %w[GITHUB_RUN_ID GITHUB_RUN_ATTEMPT].each { |key| ENV.delete(key) unless saved.key?(key) }
  end

  def test_notifier_uses_same_audience_and_preserves_recipe
    path = @directory.join("upstream.rb")
    path.write(recipe)
    env = {
      "GITHUB_REPOSITORY" => "owner/tool", "TAP_REPOSITORY" => "owner/homebrew-tap",
      "PACKAGE" => "tool", "TAG" => "v1.2.0", "RECIPE_PATH" => path.to_s,
      "ACTIONS_ID_TOKEN_REQUEST_URL" => "https://example.test/token?existing=1",
      "ACTIONS_ID_TOKEN_REQUEST_TOKEN" => "credential"
    }
    http = Object.new
    test = self
    expected = PackageUpdate.audience(@request, env.fetch("TAP_REPOSITORY"))
    http.define_singleton_method(:request) do |req|
      test.assert_equal expected, URI.decode_www_form(URI(req.path).query).to_h.fetch("audience")
      response = Net::HTTPOK.new("1.1", "200", "OK")
      response.define_singleton_method(:body) { '{"value":"signed-token"}' }
      response
    end
    Net::HTTP.stub(:start, ->(*_, **_, &block) { block.call(http) }) do
      tap, body = NotifyPackageUpdate.payload(env)
      assert_equal "owner/homebrew-tap", tap
      payload = JSON.parse(body).fetch("client_payload")
      assert_equal recipe, payload.fetch("recipe")
      assert_equal "signed-token", payload.fetch("identity_token")
    end
  end

  def test_legacy_pkg_adapter_and_prerelease_pagination
    root = Pathname.new(__dir__).parent
    original = root.join("Casks/squirrel.rb").read
    api = Object.new
    api.define_singleton_method(:repository) { "PBK-B/squirrel" }
    api.define_singleton_method(:download) { |*_, **_| "a" * 64 }
    release = { "assets" => [{ "name" => "Squirrel-1.2.0.pkg" }] }
    updated = PackageUpdate.legacy_recipe(api, release, original, PackageUpdate::LEGACY.fetch("squirrel"), "1.2.0", @directory, root)
    assert_equal "1.2.0", PackageUpdate.recipe_version(updated)
    assert_equal original.split("  uninstall", 2).last, updated.split("  uninstall", 2).last
    client = PackageUpdate::GitHub.new("owner/tool")
    pages = [Array.new(99) { { "tag_name" => "invalid" } } + [{ "tag_name" => "1.2.0-beta.2" }], [{ "tag_name" => "1.2.0-beta.10" }, { "tag_name" => "2.0.0", "draft" => true }]]
    client.define_singleton_method(:api) { |path| pages.fetch(path.split("page=").last.to_i - 1) }
    assert client.current?("1.2.0-beta.10", { "channel" => "prerelease" })
    refute client.current?("1.2.0-beta.2", { "channel" => "prerelease" })
  end

  def test_complete_legacy_prepare_and_publish_without_oidc_or_env
    root = Pathname.new(__dir__).parent
    @root.join("Casks").mkpath
    @root.join("Casks/squirrel.rb").write(root.join("Casks/squirrel.rb").read)
    ENV["HOMEBREW_UPDATE_TRUST"] = ""
    api = FakeGitHub.new
    api.release["tag_name"] = "1.2.0"
    api.release["assets"] = [{ "id" => 20, "name" => "Squirrel-1.2.0.pkg", "size" => 10, "state" => "uploaded" }]
    api.define_singleton_method(:repository) { "PBK-B/squirrel" }
    api.define_singleton_method(:download) { |*_, **_| "a" * 64 }
    request = PackageUpdate.request_from_event({ "client_payload" => { "package" => "squirrel", "tag" => "1.2.0" } }, "repository_dispatch")
    result = PackageUpdate.prepare(@root, @directory, request, client: api)
    assert_equal "true", result.fetch("current")
    assert_equal "cask", result.fetch("kind")
    assert PackageUpdate.check(@root, @directory, request, client: api)
    api.latest = false
    refute PackageUpdate.check(@root, @directory, request, client: api)
  end
end
