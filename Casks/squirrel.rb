cask "squirrel" do
  version "1.1.2-beta5"
  sha256 "0450d972845c7cf901b331ab6def4a1f870e28079dbc980cba51561b73d888ea"

  url "https://github.com/PBK-B/squirrel/releases/download/1.1.2-beta5/Squirrel-1.1.2.pkg"
  name "Squirrel"
  desc "Customized Rime input method for macOS"
  homepage "https://github.com/PBK-B/squirrel"

  depends_on macos: :ventura

  pkg "Squirrel-1.1.2.pkg"

  uninstall pkgutil: "im.rime.inputmethod.Squirrel",
            delete:  "/Library/Input Methods/Squirrel.app"

  caveats <<~EOS
    This package replaces Squirrel.app in /Library/Input Methods.
    Your Rime configuration and dictionaries are preserved.
    If squirrel-app is managed by Homebrew, migrate its record before installation;
    uninstalling the old cask afterwards can delete the replacement application.
    Do not use the official upstream in-app updater for this fork;
    use brew upgrade --cask zmide/tap/squirrel instead.
  EOS
end
