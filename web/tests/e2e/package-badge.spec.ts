import { appConfig, basePath, entries, expect, openPage, packageRoute, selectedEntry, test } from './fixtures';

test('badge metadata is published independently of native APIs', async ({ request }) => {
	for (const entry of entries) {
		const response = await request.get(`${basePath}badges/${entry.kind}/${encodeURIComponent(entry.name)}.json`);
		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toContain('application/json');
		expect(await response.json()).toEqual({
			schemaVersion: 1,
			label: 'Homebrew',
			message: entry.version || 'unknown',
			color: entry.version ? 'orange' : 'lightgrey',
			namedLogo: 'homebrew',
		});
	}
	expect((await request.get(`${basePath}badges/formula/no-such-package-4f57d82e.json`)).status()).toBe(404);
});

test('prerendered badges copy stable public URLs without a customization panel', async ({ page, request }) => {
	test.skip(!selectedEntry, 'A package is required');
	const path = packageRoute(selectedEntry!);
	const externalImages: string[] = [];
	page.on('request', (request) => {
		if (request.url().startsWith('https://img.shields.io/')) externalImages.push(request.url());
	});
	expect(await (await request.get(path)).text()).toContain('data-package-badge');
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				writeText: async (text: string) => {
					(window as Window & { copiedBadge?: string }).copiedBadge = text;
				},
			},
		});
	});
	await openPage(page, path);
	const badge = page.locator('[data-package-badge]');
	await expect(badge.locator('[data-badge-preview]')).toHaveText(`Homebrew${selectedEntry!.version || 'unknown'}`);
	await expect(badge.locator('img')).toHaveAttribute('src', `${basePath}homebrew.svg`);
	const copy = badge.getByRole('button', { name: 'Copy Markdown', exact: true });
	await expect(copy).toHaveText('');
	await expect(badge.getByRole('tooltip', { includeHidden: true })).toBeHidden();
	await copy.hover();
	await expect(badge.getByRole('tooltip')).toHaveText('Copy Markdown');
	await copy.focus();
	await page.mouse.move(0, 0);
	await expect(badge.getByRole('tooltip')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(badge.getByRole('tooltip', { includeHidden: true })).toBeHidden();
	const before = await badge.boundingBox();
	await copy.click();
	await expect(badge.getByRole('status')).toHaveText('Copied!');
	await expect(badge.getByRole('tooltip')).toHaveText('Copied!');
	await expect(badge.getByRole('status')).toHaveClass('sr-only');
	expect((await badge.boundingBox())?.height).toBe(before?.height);
	const copied = await page.evaluate(() => (window as Window & { copiedBadge?: string }).copiedBadge);
	expect(copied).toContain(`${appConfig.site.origin}${packageRoute(selectedEntry!)}`);
	expect(copied).toContain('https://img.shields.io/endpoint?');
	expect(copied).not.toMatch(/localhost|127\.0\.0\.1/);
	await expect(badge.locator('details, input, [role="combobox"]')).toHaveCount(0);
	await expect(badge.getByRole('button')).toHaveCount(1);
	await expect(badge.getByRole('status')).toBeEmpty({ timeout: 4000 });
	expect((await badge.boundingBox())?.height).toBe(before?.height);
	expect(externalImages).toEqual([]);
});

test('clipboard rejection reveals manual embed fallback', async ({ page }) => {
	test.skip(!selectedEntry, 'A package is required');
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'clipboard', {
			value: {
				writeText: async () => {
					throw new Error('Denied');
				},
			},
		});
	});
	await openPage(page, packageRoute(selectedEntry!));
	const badge = page.locator('[data-package-badge]');
	await badge.getByRole('button', { name: 'Copy Markdown', exact: true }).click();
	await expect(badge.getByRole('status')).toContainText('manually');
	await expect(badge.locator('pre:visible')).toBeVisible();
});

test('default embed code remains selectable without JavaScript', async ({ browser }) => {
	test.skip(!selectedEntry, 'A package is required');
	const context = await browser.newContext({ javaScriptEnabled: false });
	try {
		const page = await context.newPage();
		await page.goto(new URL(packageRoute(selectedEntry!), test.info().project.use.baseURL).href);
		const badge = page.locator('[data-package-badge]');
		await expect(badge.locator('code')).toBeVisible();
		await expect(badge.locator('code')).toContainText('https://img.shields.io/endpoint?');
	} finally {
		await context.close();
	}
});

for (const width of [1440, 768, 390, 320]) {
	test(`badge, success tooltip and failure fallback fit at ${width}px in both languages`, async ({ page }) => {
		test.skip(!selectedEntry, 'A package is required');
		await page.setViewportSize({ width, height: 900 });
		await page.addInitScript(() => {
			Object.defineProperty(navigator, 'clipboard', {
				value: {
					writeText: async () => {
						if ((window as Window & { rejectBadgeCopy?: boolean }).rejectBadgeCopy) throw new Error('Denied');
					},
				},
			});
		});
		for (const locale of appConfig.i18n.locales) {
			await openPage(page, packageRoute(selectedEntry!, locale));
			const badge = page.locator('[data-package-badge]');
			const copy = badge.getByRole('button', { name: locale === 'zh-CN' ? '复制 Markdown' : 'Copy Markdown', exact: true });
			const before = await badge.boundingBox();
			await copy.click();
			await expect(badge.getByRole('tooltip')).toHaveText(locale === 'zh-CN' ? '已复制！' : 'Copied!');
			expect((await badge.boundingBox())?.height).toBe(before?.height);
			const tooltip = await badge.getByRole('tooltip').boundingBox();
			expect(tooltip!.x).toBeGreaterThanOrEqual(0);
			expect(tooltip!.x + tooltip!.width).toBeLessThanOrEqual(width);
			await page.evaluate(() => {
				(window as Window & { rejectBadgeCopy?: boolean }).rejectBadgeCopy = true;
			});
			await copy.click();
			await expect(badge.getByRole('status')).not.toBeEmpty();
			const code = await badge.locator('pre:visible code').innerText();
			expect(code).toContain(`${appConfig.site.origin}${packageRoute(selectedEntry!)}`);
			await expect.poll(() => page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(1);
		}
	});
}
