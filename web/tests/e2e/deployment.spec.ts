import { readdirSync } from 'node:fs';
import { appConfig, entries, expect, openPage, packageRoute, route, selectedEntry, test } from './fixtures';
import { publicDirectory } from './settings.mjs';

test('canonical and language alternates use the configured public origin and base path', async ({ page }) => {
	for (const locale of appConfig.i18n.locales) {
		for (const path of [route('', locale), ...(selectedEntry ? [packageRoute(selectedEntry, locale)] : [])]) {
			await openPage(page, path);
			await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${appConfig.site.origin}${path}`);
			for (const language of appConfig.i18n.locales) {
				const alternate = path === route('', locale) ? route('', language) : packageRoute(selectedEntry!, language);
				await expect(page.locator(`link[rel="alternate"][hreflang="${language}"]`)).toHaveAttribute('href', `${appConfig.site.origin}${alternate}`);
			}
		}
	}
});

test('robots and sitemap advertise only the configured public URLs', async ({ request }) => {
	const robots = await request.get(route('robots.txt'));
	expect(robots.status()).toBe(200);
	expect(await robots.text()).toContain(`Sitemap: ${appConfig.site.origin}${route('sitemap.xml')}`);
	const sitemap = await request.get(route('sitemap.xml'));
	expect(sitemap.status()).toBe(200);
	const urls = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
	const expected = appConfig.i18n.locales.flatMap((locale: string) => [
		...['', 'formula/', 'cask/'].map((path) => `${appConfig.site.origin}${route(path, locale)}`),
		...entries.map((entry) => `${appConfig.site.origin}${packageRoute(entry, locale)}`),
	]);
	expect(urls.sort()).toEqual(expected.sort());
});

test('deployment contains static assets without development sources, old data or Pages Functions', () => {
	const files = readdirSync(publicDirectory, { recursive: true }).map(String);
	expect(files).toContain('404.html');
	for (const file of files) {
		expect(file).not.toMatch(/(?:^|\/)(?:\.nojekyll|favicon\.svg|statistics\.json|_worker\.js|\.generated|node_modules|tests|demo|functions)(?:\/|$)/);
		expect(file).not.toMatch(/\.(?:tsx?|mjs|rb|md|map)$/);
	}
});
