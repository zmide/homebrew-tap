# frozen_string_literal: true

require "digest"
require "json"
require "net/http"
require "uri"

# Run in an upstream tag workflow with id-token: write. No checkout of the tap is
# necessary: this helper can be copied upstream and has no nonstandard dependencies.
module NotifyPackageUpdate
  def self.payload(env = ENV)
    repository = env.fetch("GITHUB_REPOSITORY")
    tap = env.fetch("TAP_REPOSITORY")
    recipe = File.read(env.fetch("RECIPE_PATH"), encoding: "UTF-8")
    raise "Recipe must be valid UTF-8 and at most 32 KiB" unless recipe.valid_encoding? && recipe.bytesize.between?(1, 32 * 1024)
    request = { "repository" => repository, "package" => env.fetch("PACKAGE"), "tag" => env.fetch("TAG"), "recipe" => recipe }
    fields = ["v1", tap.downcase, repository.downcase, request.fetch("package"), request.fetch("tag"), Digest::SHA256.hexdigest(recipe)]
    audience = "homebrew-update:v1:#{tap.downcase}:#{Digest::SHA256.hexdigest(JSON.generate(fields))}"
    uri = URI(env.fetch("ACTIONS_ID_TOKEN_REQUEST_URL"))
    raise "Unexpected OIDC request endpoint" unless uri.is_a?(URI::HTTPS) && !uri.userinfo
    query = URI.decode_www_form(uri.query.to_s).reject { |key, _| key == "audience" }
    uri.query = URI.encode_www_form(query + [["audience", audience]])
    token_request = Net::HTTP::Get.new(uri)
    token_request["Authorization"] = "Bearer #{env.fetch('ACTIONS_ID_TOKEN_REQUEST_TOKEN')}"
    response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 30, read_timeout: 60) { |http| http.request(token_request) }
    raise "OIDC request failed (#{response.code})" unless response.is_a?(Net::HTTPSuccess)
    request["identity_token"] = JSON.parse(response.body).fetch("value")
    body = JSON.generate("event_type" => "update-package", "client_payload" => request)
    # GitHub caps client_payload at 65,535 characters; a byte cap is conservative
    # and accounts for JSON escaping, rather than only checking the Ruby file size.
    raise "Dispatch payload too large" if JSON.generate(request).bytesize > 65_535
    [tap, body]
  end

  def self.main
    tap, body = payload
    raise "Invalid tap repository" unless %r{\A[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*\z}.match?(tap)
    uri = URI("https://api.github.com/repos/#{tap}/dispatches")
    request = Net::HTTP::Post.new(uri)
    request["Authorization"] = "Bearer #{ENV.fetch('GH_TOKEN')}"
    request["Accept"] = "application/vnd.github+json"
    request["Content-Type"] = "application/json"
    request["User-Agent"] = "homebrew-tap-notifier"
    request.body = body
    response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 30, read_timeout: 60) { |http| http.request(request) }
    raise "Dispatch failed (#{response.code})" unless response.code == "204"
    puts "Package update queued"
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    NotifyPackageUpdate.main
  rescue StandardError => error
    # HTTP bodies and JWTs are credentials: do not include them in failure logs.
    warn "Notification failed (#{error.class}); check configuration and request size"
    exit 1
  end
end
