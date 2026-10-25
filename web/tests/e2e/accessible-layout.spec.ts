import { appConfig, expect, openPage, packageRoute, route, selectedEntry, test } from './fixtures';

for (const width of [1440, 768, 390, 320]) {
	test(`200% text sizing preserves readable, unclipped content at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 900 });
		for (const locale of appConfig.i18n.locales) {
			for (const path of [route('', locale), ...(selectedEntry ? [packageRoute(selectedEntry, locale)] : [])]) {
				await openPage(page, path);
				await page.addStyleTag({ content: 'html { font-size: 200%; }' });
				await expect(page.locator('body')).toHaveCSS('font-size', '34px');
				await expect(page.locator('h1')).toHaveCSS('font-size', width <= 680 ? '56px' : '68px');
				expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(1);
				const clipped = await page
					.locator('h1, h2, h3, p, dt, dd, .package-row, .tap-banner, .search-box')
					.evaluateAll((nodes) =>
						nodes.filter((node) => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1).map((node) => node.textContent?.slice(0, 80)),
					);
				expect(clipped, 'Text and its containers grow instead of clipping').toEqual([]);
				const header = page.locator('.site-header');
				const boxes = await header.locator('.brand, .header-actions').evaluateAll((nodes) =>
					nodes.map((node) => {
						const box = node.getBoundingClientRect();
						return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
					}),
				);
				expect(boxes[1]!.left - boxes[0]!.right).toBeGreaterThanOrEqual(8);
				const headerBox = (await header.boundingBox())!;
				for (const box of boxes) {
					expect(box.top).toBeGreaterThanOrEqual(headerBox.y);
					expect(box.bottom).toBeLessThanOrEqual(headerBox.y + headerBox.height);
				}
				if (await page.locator('article').count()) {
					const article = (await page.locator('article').boundingBox())!;
					const main = (await page.locator('[data-detail-main]').boundingBox())!;
					expect(main.width).toBeCloseTo(article.width, 0);
					for (const label of await page.locator('article button[aria-pressed] > span:last-child').all()) {
						await expect(label).toHaveCSS('white-space', 'normal');
						expect(await label.evaluate((node) => node.scrollWidth - node.clientWidth), 'Chart legend labels wrap instead of clipping').toBeLessThanOrEqual(1);
					}
				} else {
					const search = page.getByRole('searchbox');
					await search.fill('no-matching-package-200-percent');
					await expect(page.locator('.empty-state')).toBeVisible();
					await page.locator('.empty-state button').click();
					await expect(search).toHaveValue('');
				}
				const theme = page.locator('.theme-menu > button');
				await theme.click();
				await expect(page.locator('.theme-menu [role="listbox"]')).toBeVisible();
				const menu = (await page.locator('.theme-menu [role="listbox"]').boundingBox())!;
				const viewport = page.viewportSize()!;
				expect(menu.x).toBeGreaterThanOrEqual(0);
				expect(menu.x + menu.width).toBeLessThanOrEqual(viewport.width);
				await page.keyboard.press('Escape');
			}
		}
	});
}

test('primary touch controls keep 44px targets without enlarging the header glyphs', async ({ browser }) => {
	const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
	try {
		const page = await context.newPage();
		for (const path of [route(), ...(selectedEntry ? [packageRoute(selectedEntry)] : [])]) {
			await openPage(page, path);
			if (await page.getByRole('searchbox').count()) await page.getByRole('searchbox').fill('test');
			const controls = page.locator(
				'.header-actions a:visible, .header-actions button, .filter-tabs button, .sort-control button, .search-box button, .command button, [data-package-badge] button',
			);
			for (const control of await controls.all()) {
				const box = (await control.boundingBox())!;
				expect(box.width).toBeGreaterThanOrEqual(44);
				expect(box.height).toBeGreaterThanOrEqual(44);
			}
			await expect(page.locator('.theme-menu svg')).toHaveCSS('width', '18px');
			await page.locator('.theme-menu > button').tap();
			for (const option of await page.locator('.theme-menu [role="option"]').all()) expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(44);
		}
	} finally {
		await context.close();
	}
});

test('200% zoom-equivalent reflow fits a 720px CSS viewport and retains all content', async ({ page }) => {
	// A 1440px browser at 200% page zoom exposes a 720px-wide CSS viewport.
	// Test that effective layout separately from the text-only enlargement above.
	await page.setViewportSize({ width: 720, height: 450 });
	for (const locale of appConfig.i18n.locales) {
		for (const path of [route('', locale), route('formula/', locale), route('cask/', locale), ...(selectedEntry ? [packageRoute(selectedEntry, locale)] : [])]) {
			await openPage(page, path);
			expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(1);
			await expect(page.locator('h1')).toBeVisible();
			await page.locator('.site-footer').scrollIntoViewIfNeeded();
			await expect(page.locator('.site-footer')).toBeVisible();
		}
	}
});
