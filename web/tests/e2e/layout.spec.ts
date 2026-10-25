import { appConfig, expect, openPage, packageRoute, route, selectedEntry, test } from './fixtures';

for (const width of [1440, 1024, 1023, 768, 681, 680, 390, 320]) {
	test(`page sections share aligned content edges at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 900 });
		const locales = [appConfig.i18n.defaultLocale, ...appConfig.i18n.locales.filter((locale: string) => locale !== appConfig.i18n.defaultLocale)];
		for (const locale of locales) {
			for (const path of ['', 'formula/', 'cask/']) {
				await openPage(page, route(path, locale));
				const grid = await page.locator('.site-shell').evaluate((node) => {
					const style = getComputedStyle(node);
					return { columns: style.gridTemplateColumns.split(' ').length, gap: parseFloat(style.columnGap), gutter: parseFloat(style.paddingLeft) };
				});
				expect(grid).toEqual({ columns: width <= 680 ? 4 : width <= 1023 ? 8 : 12, gap: width <= 680 ? 16 : 24, gutter: width <= 680 ? 20 : width <= 1023 ? 24 : 32 });
				const edges = await page
					.locator('.site-header, .hero, .search-box, .results-section, .catalog-toolbar, .package-row, .tap-banner, .site-footer')
					.evaluateAll((nodes) =>
						nodes.map((node) => {
							const box = node.getBoundingClientRect();
							return { left: box.left, right: box.right };
						}),
					);
				const reference = edges[0]!;
				for (const edge of edges) {
					expect(Math.abs(edge.left - reference.left), `${locale}/${path} left edge`).toBeLessThanOrEqual(1);
					expect(Math.abs(edge.right - reference.right), `${locale}/${path} right edge`).toBeLessThanOrEqual(1);
				}
				expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(1);
				if (width === 1440) expect(reference.right - reference.left).toBeCloseTo(1120, 0);
			}
		}
		if (selectedEntry) {
			await openPage(page, packageRoute(selectedEntry));
			const header = await page.locator('.site-header').boundingBox();
			const article = await page.locator('.detail-page article').boundingBox();
			expect(article!.x).toBeCloseTo(header!.x, 0);
			expect(article!.width).toBeCloseTo(header!.width, 0);
			await expect(page.locator('.command code')).toHaveCSS('scrollbar-width', 'none');
			if (width >= 1024) {
				const sidebar = await page.locator('article aside').boundingBox();
				expect(sidebar!.width).toBeCloseTo(((article!.width - 24 * 11) / 12) * 4 + 24 * 3, 0);
				expect(sidebar!.width).toBeLessThan(article!.width / 2);
				const content = await page.locator('article aside').evaluate((aside) => {
					const main = aside.parentElement!.querySelector('[data-detail-main]')!.getBoundingClientRect();
					return { right: main.right, width: main.width };
				});
				expect(sidebar!.x - content.right).toBeCloseTo(24, 0);
				expect(content.width).toBeCloseTo(((article!.width - 24 * 11) / 12) * 8 + 24 * 7, 0);
				expect(content.width).toBeGreaterThan(sidebar!.width);
				const install = await page
					.locator('article .command-wrap')
					.first()
					.evaluate((node) => node.closest('section')!.getBoundingClientRect().bottom);
				expect(sidebar!.y - install).toBeCloseTo(32, 0);
			} else {
				const main = await page.locator('[data-detail-main]').boundingBox();
				const sidebar = await page.locator('article aside').boundingBox();
				expect(main!.width).toBeCloseTo(article!.width, 0);
				expect(sidebar!.width).toBeCloseTo(article!.width, 0);
			}
			await page.locator('article > details summary').click();
			expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(1);
			for (const box of await page.locator('article .code-block, article .command').evaluateAll((nodes) =>
				nodes.map((node) => {
					const rect = node.getBoundingClientRect();
					return { left: rect.left, right: rect.right };
				}),
			)) {
				expect(box.left).toBeGreaterThanOrEqual(header!.x - 1);
				expect(box.right).toBeLessThanOrEqual(header!.x + header!.width + 1);
			}
		}
	});
}
