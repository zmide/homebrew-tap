import { versionedPackage } from '../../../shared/homebrew-package-routes.mjs';
import { allEntries, appConfig, basePath, expect, openPage, packageRoute, route, test } from './fixtures';

for (const entry of allEntries.filter((entry) => versionedPackage(entry.name)?.fixed)) {
	test(`${entry.kind}:${entry.name} has an implicit version page and correctly copied badge`, async ({ page, request }) => {
		await page.addInitScript(() => {
			Object.defineProperty(navigator, 'clipboard', {
				value: {
					writeText: async (text: string) => {
						(window as Window & { copiedBadge?: string }).copiedBadge = text;
					},
				},
			});
		});
		for (const locale of appConfig.i18n.locales) {
			await openPage(page, packageRoute(entry, locale));
			await expect(page.locator('body')).toContainText(`brew install ${entry.kind === 'cask' ? '--cask ' : ''}${entry.fullName}`);
			await expect(page.locator('[data-badge-preview]')).toHaveText(`Homebrew${entry.version}`);
			await page.locator('[data-package-badge] button').click();
			const copied = await page.evaluate(() => (window as Window & { copiedBadge?: string }).copiedBadge);
			expect(copied).toContain(`${appConfig.site.origin}${packageRoute(entry)}`);
			const image = copied!.match(/\]\((https:\/\/img\.shields\.io\/[^)]+)\)/)![1];
			expect(new URL(image!).searchParams.get('url')).toBe(`${appConfig.site.origin}${basePath}badges/${entry.kind}/${encodeURIComponent(entry.name)}.json`);
			await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${appConfig.site.origin}${packageRoute(entry, locale)}`);
		}
		const legacy = route(`${entry.kind}/${encodeURIComponent(entry.name)}/`);
		expect((await request.get(legacy)).status()).toBe(200);
		await openPage(page, route(entry.kind + '/'));
		await expect(page.locator(`.package-row[href="${packageRoute(entry)}"]`)).toHaveCount(0);
	});
}

test('unknown fixed versions do not fall back to current', async ({ request }) => {
	expect((await request.get(route('formula/oci-mirror-proxy/v/0.0.0/'))).status()).toBe(404);
});
