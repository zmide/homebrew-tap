# frozen_string_literal: true

gem "jwt", "= 2.10.2"
require "jwt"
require "time"

module PackageUpdate
  ISSUER = "https://token.actions.githubusercontent.com"

  # A fixed-order array avoids JSON object ordering ambiguities across languages.
  # Binding the audience to the recipe prevents borrowing a CI token for other code.
  def self.audience(request, tap)
    fields = ["v1", tap.downcase, request.fetch("repository").downcase,
              request.fetch("package"), request.fetch("tag"), Digest::SHA256.hexdigest(request.fetch("recipe"))]
    "homebrew-update:v1:#{tap.downcase}:#{Digest::SHA256.hexdigest(JSON.generate(fields))}"
  end

  def self.trusted?(repository, raw)
    entries = JSON.parse(raw.to_s.empty? ? "[]" : raw)
    ensure!(entries.is_a?(Array), "HOMEBREW_UPDATE_TRUST must be an array")
    entries.each do |entry|
      ensure!(entry.is_a?(String) && %r{\A[A-Za-z0-9][A-Za-z0-9_.-]*(?:/(?:\*|[A-Za-z0-9][A-Za-z0-9_.-]*))?\z}.match?(entry), "Invalid trust entry")
    end
    entries.any? do |entry|
      owner, repo = entry.downcase.split("/", 2)
      source_owner, = repository.downcase.split("/", 2)
      (!repo || repo == "*") ? owner == source_owner : entry.casecmp?(repository)
    end
  end

  def self.jwks
    data = +""
    # The issuer and key endpoint are pinned; JWT headers cannot choose a key URL.
    GitHub.new("unused/unused").request("#{ISSUER}/.well-known/jwks", limit: 1024 * 1024) { |chunk| data << chunk }
    JSON.parse(data)
  end

  def self.verify_identity(request, tap:, at: Time.now.to_i, keys: nil)
    token = request.fetch("identity_token")
    ensure!(token.is_a?(String) && token.bytesize.between?(1, 20_000), "Missing or oversized OIDC token")
    claims, = JWT.decode(token, nil, true,
                         algorithms: ["RS256"], jwks: keys || jwks,
                         verify_expiration: false, verify_not_before: false,
                         verify_iss: true, iss: ISSUER,
                         verify_aud: true, aud: audience(request, tap))
    # Explicit time checks also support historical verification at the trusted
    # prepare-step completion time, never at an artifact-supplied timestamp.
    %w[iat nbf exp].each { |key| ensure!(claims[key].is_a?(Integer), "Missing OIDC #{key}") }
    ensure!(claims["exp"] > claims["iat"] && claims["exp"] - claims["iat"] <= 900, "Invalid OIDC lifetime")
    ensure!(claims["iat"] <= at + 30 && claims["nbf"] <= at + 30 && claims["exp"] > at, "OIDC token expired or not yet valid; resend notification")
    ensure!(claims["repository"].is_a?(String) && claims["repository"].casecmp?(request.fetch("repository")), "OIDC repository mismatch")
    %w[repository_id run_id run_attempt].each { |key| ensure!(/\A[1-9]\d*\z/.match?(claims[key].to_s), "Missing OIDC #{key}") }
    ensure!(claims["ref"] == "refs/tags/#{request.fetch('tag')}" && claims["ref_type"] == "tag", "OIDC must originate from the release tag")
    ensure!(%w[push release workflow_dispatch].include?(claims["event_name"]), "Unsupported upstream event")
    ensure!(claims["sha"].is_a?(String) && /\A[0-9a-f]{40}\z/.match?(claims["sha"]), "Invalid OIDC commit")
    expected_workflow = %r{\A#{Regexp.escape(request.fetch('repository'))}/\.github/workflows/[^@]+@refs/tags/#{Regexp.escape(request.fetch('tag'))}\z}i
    ensure!(claims["workflow_ref"].is_a?(String) && expected_workflow.match?(claims["workflow_ref"]), "OIDC workflow mismatch")
    claims
  end

  def self.verify_upstream!(api, request, claims)
    identity = api.api("").fetch("id")
    ensure!(identity.to_s == claims.fetch("repository_id"), "Repository identity mismatch")
    commit = api.api("commits/#{escape(request.fetch('tag'))}").fetch("sha")
    ensure!(commit == claims.fetch("sha"), "Release tag does not match authenticated CI commit")
    run = api.api("actions/runs/#{claims.fetch('run_id')}")
    ensure!(run.dig("repository", "id") == identity && run["head_sha"] == commit && run["run_attempt"].to_s == claims["run_attempt"].to_s, "Upstream CI run mismatch")
    identity
  end

  def self.recipe_source(text)
    # Read only literal URL prefixes, never evaluate Ruby in the privileged job.
    # Interpolation in the tag/filename is fine; a dynamic host/owner/repo is not.
    urls = text.scan(/^\s*url\s+["']([^"'\n]+)["']/).flatten
    ensure!(!urls.empty?, "Recipe must declare literal GitHub Release URLs")
    ensure!(text.scan(/^\s*url\b/).length == urls.length, "Dynamic URL stanzas are not supported")
    sources = urls.map do |url|
      match = %r{\Ahttps://github\.com/([A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*)/releases/download/[^\s]+\z}.match(url)
      ensure!(match, "Cannot determine fixed upstream from recipe URL")
      match[1].downcase
    end.uniq
    ensure!(sources.length == 1, "Recipe has multiple upstream repositories")
    sources.first
  end

  def self.authorize!(root, request, kind, text: nil)
    path = existing(root, request.fetch("package"))
    repository = request.fetch("repository")
    # Legacy sources remain in the existing compatibility configuration. New
    # direct recipes carry their durable source in standard Homebrew URLs only.
    if text
      ensure!(recipe_source(text).casecmp?(repository), "Candidate download source does not match authenticated repository")
    end
    if path
      ensure!(recipe_kind(path.read, request.fetch("package")) == kind, "Cannot change package type")
      source = LEGACY[request.fetch("package")]&.fetch("repository") || recipe_source(path.read)
      ensure!(source.casecmp?(repository), "Cannot change fixed upstream")
    else
      ensure!(trusted?(repository, ENV["HOMEBREW_UPDATE_TRUST"]), "New source is not allowed")
    end
  end

  def self.prepared_at
    # Jobs/steps are returned by GitHub for this exact run attempt. An artifact
    # cannot forge the time at which the trusted prepare step finished successfully.
    run = ENV.fetch("GITHUB_RUN_ID")
    attempt = ENV.fetch("GITHUB_RUN_ATTEMPT")
    api = GitHub.new(ENV.fetch("GITHUB_REPOSITORY"))
    matches = []
    page = 1
    loop do
      jobs = api.api("actions/runs/#{run}/attempts/#{attempt}/jobs?per_page=100&page=#{page}").fetch("jobs")
      matches.concat(jobs.select { |job| job["name"] == "generate" && job["conclusion"] == "success" })
      break if jobs.length < 100
      page += 1
    end
    ensure!(matches.length == 1, "Cannot establish trusted preparation time")
    steps = matches.first.fetch("steps").select { |step| step["name"] == "Select release and prepare candidate" && step["conclusion"] == "success" }
    ensure!(steps.length == 1, "Missing successful preparation step")
    Time.iso8601(steps.first.fetch("completed_at")).to_i
  end
end
