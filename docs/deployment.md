# Cloudflare Pages deployment

The production URL is **https://brew.zmorg.cn/**. `tap.config.json` sets
`site.origin` to `https://brew.zmorg.cn` and `site.basePath` to `/`. Canonical
URLs, language alternates, sitemap, robots and copied badge links use this
configuration. Change it and regenerate before deploying at another address.

## Create the site

1. In Cloudflare **Workers & Pages**, create a Pages **Direct Upload** project.
   Use the repository's default branch as its production branch. Do not select
   Cloudflare Git builds: fresh metadata export needs Homebrew, with macOS
   needed for Casks. A Direct Upload project cannot later be converted to Git
   integration without recreating it.
2. Build on macOS with `pnpm generate` and upload **`web/.output/public/`** using
   the dashboard or Wrangler. The folder contains the site root, not a nested
   `homebrew-tap/` folder. Do not upload `.output/server`, `.generated`, the
   repository, tests or dependencies. No Pages Functions or Worker is required.
3. In the Pages project's **Custom domains**, add `brew.zmorg.cn` and follow
   DNS validation. If the zone uses Cloudflare DNS, the CNAME can be added
   automatically; otherwise point `brew` to the project's `*.pages.dev` name.
   Associate the domain in Pages first; adding only a CNAME is insufficient.
4. Wait for DNS validation and the HTTPS certificate to become active.

For local uploads, authenticate with `npx wrangler login`, then run:

```sh
pnpm generate
npx wrangler pages deploy web/.output/public --project-name=YOUR_PROJECT --branch=YOUR_DEFAULT_BRANCH
```

Do not configure a wildcard SPA rewrite to `/index.html`. Prerendered detail
routes must load directly, and missing pages/API files must return HTTP 404.
Keep the generated root `404.html`. Use Pages' normal caching rather than a
zone-wide "Cache Everything" rule that can hold stale HTML or JSON.

## Automatic uploads from GitHub Actions

`.github/workflows/cloudflare.yml` builds and checks on macOS, then uploads an
artifact to a separate Ubuntu deployment job. It does **not** use GitHub Pages.

Configure these repository/environment settings:

| Setting                    | Kind                | Value                                                                |
| -------------------------- | ------------------- | -------------------------------------------------------------------- |
| `CLOUDFLARE_PAGES_PROJECT` | Repository variable | Existing Direct Upload project name                                  |
| `CLOUDFLARE_ACCOUNT_ID`    | Actions secret      | Cloudflare account ID                                                |
| `CLOUDFLARE_API_TOKEN`     | Actions secret      | Token with Account → Cloudflare Pages → Edit, scoped to that account |

The deployment job uses the `cloudflare-pages` GitHub environment. Restrict it
to the default branch and add approvals if desired. Secrets are not passed to
the build job or pull-request checks. Without the project variable, deployment
is skipped so a clone/template remains usable without Cloudflare credentials.

Deployment runs on default-branch pushes, manual default-branch runs and
successful same-repository/default-branch **Update package** completions.
The latter is needed because commits pushed with `GITHUB_TOKEN` do not trigger
normal push workflows. Builds always check out the latest trusted default
branch. Deployments share a concurrency group and do not cancel an active run.
Set the Pages production branch to the same default branch; otherwise uploads
will be previews rather than updates to the custom domain.

The workflows do not create a Cloudflare project, change DNS, bind domains or
enable GitHub repository settings automatically. Keep any old GitHub Pages
deployment disabled in the repository settings.

## Verify a deployment

- `/`, `/zh-CN/` and a package detail URL load and refresh directly.
- Assets load from `/_nuxt/`, not `/homebrew-tap/_nuxt/`.
- `/api/formula.json` returns JSON; a nonexistent API returns HTTP 404.
- `/robots.txt` and `/sitemap.xml` reference `https://brew.zmorg.cn/`.
- Canonical URLs and copied badge Markdown use the custom domain.

References: [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/),
[CI uploads](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/),
[custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/).
