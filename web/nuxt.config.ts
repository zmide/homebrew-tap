import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import config from '../tap.config.json';

const root = fileURLToPath(new URL('.', import.meta.url));
const indexFile = `${root}.generated/search-index.json`;
const index = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : [];
const entries = Array.isArray(index) ? index : index.entries || [];
const routes = ['/', '/formula/', '/cask/', ...entries.map((item: { kind: string; name: string }) => `/${item.kind}/${encodeURIComponent(item.name)}/`)];
const baseURL = process.env.NUXT_APP_BASE_URL || config.site.basePath;
const demo = process.env.TAP_DEMO === '1';
if (demo && process.argv.some((arg) => ['generate', 'build'].includes(arg))) throw new Error('Demo data is restricted to local development.');

export default defineNuxtConfig({
	compatibilityDate: '2026-10-25',
	srcDir: '.',
	components: false,
	alias: { '#catalog-data': `${root}${demo ? 'demo/catalog-data.ts' : 'lib/catalog-data.ts'}` },
	buildDir: demo ? '.nuxt-demo' : undefined,
	extensions: ['.js', '.jsx', '.mjs', '.ts', '.tsx', '.vue'],
	devtools: { enabled: false },
	vite: { define: { 'import.meta.env.VITE_TAP_BASE_URL': JSON.stringify(baseURL) } },
	css: ['~/styles/main.scss'],
	app: {
		baseURL,
		head: {
			link: [{ rel: 'icon', type: 'image/svg+xml', href: `${baseURL}homebrew.svg` }],
			script: [
				{
					innerHTML:
						"try{let t=localStorage.getItem('tap-theme')||'system';document.documentElement.dataset.theme=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t}catch{}",
					tagPosition: 'head',
				},
			],
		},
	},
	typescript: { strict: true, tsConfig: { compilerOptions: { jsx: 'preserve', jsxImportSource: 'vue' } } },
	nitro: {
		publicAssets: demo ? [] : [{ dir: `${root}.generated/public`, maxAge: 0 }],
		prerender: {
			routes: [
				...config.i18n.locales.flatMap((locale) => routes.map((route) => (locale === config.i18n.defaultLocale ? route : `/${locale}${route}`))),
				'/sitemap.xml',
				'/robots.txt',
			],
			failOnError: true,
			// Every content route is explicit. Crawling project-site links would
			// prerender baseURL-prefixed duplicates and treat static JSON as pages.
			crawlLinks: false,
		},
	},
});
