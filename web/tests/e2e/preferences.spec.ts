import { appConfig, expect, openPage, packageRoute, route, selectedEntry, test } from './fixtures';

test('Chinese is prerendered with a matching HTML language and translated catalog copy', async ({ page, request }) => {
	test.skip(!appConfig.i18n.locales.includes('zh-CN'), 'Simplified Chinese is not enabled in this template');
	const path = route('', 'zh-CN');
	const html = await request.get(path);
	expect(html.status()).toBe(200);
	expect(await html.text()).toMatch(/<html[^>]+lang="zh-CN"/);
	expect(await html.text()).toContain(appConfig.brand.descriptionZh);
	await openPage(page, path);
	await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
	await expect(page.getByRole('searchbox', { name: '搜索当前 Tap' })).toBeVisible();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(appConfig.brand.title);
	await expect(page.locator('.hero-description')).toHaveText(appConfig.brand.descriptionZh);
});

test('switching language preserves package detail and the complete query', async ({ page }) => {
	test.skip(!selectedEntry || !appConfig.i18n.locales.includes('zh-CN'), 'A real package and Chinese locale are required');
	const entry = selectedEntry!;
	const query = '?q=registry%20mirror&type=formula&sort=name';
	await openPage(page, `${packageRoute(entry)}${query}`);
	await page.getByRole('link', { name: 'Switch language' }).click();
	await expect(page).toHaveURL(
		(url) =>
			url.pathname === packageRoute(entry, 'zh-CN') &&
			url.searchParams.get('q') === 'registry mirror' &&
			url.searchParams.get('type') === 'formula' &&
			url.searchParams.get('sort') === 'name',
	);
	await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(entry.displayName);
	await expect(page.locator('.command').getByRole('button', { name: '复制命令' })).toBeVisible();
	await page.getByRole('link', { name: '切换语言' }).click();
	await expect(page).toHaveURL((url) => url.pathname === packageRoute(entry) && url.searchParams.get('q') === 'registry mirror' && url.searchParams.get('sort') === 'name');
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('switching language retains an active catalog search and filter', async ({ page }) => {
	test.skip(!appConfig.i18n.locales.includes('zh-CN'), 'Simplified Chinese is not enabled in this template');
	await openPage(page, `${route()}?q=registry&type=cask&sort=name`);
	await page.getByRole('link', { name: 'Switch language' }).click();
	await expect(page).toHaveURL(
		(url) =>
			url.pathname === route('', 'zh-CN') && url.searchParams.get('q') === 'registry' && url.searchParams.get('type') === 'cask' && url.searchParams.get('sort') === 'name',
	);
	await expect(page.getByRole('searchbox', { name: '搜索当前 Tap' })).toHaveValue('registry');
	await expect(page.getByRole('combobox', { name: '软件包排序' })).toHaveAttribute('data-value', 'name');
	await expect(page.getByRole('group', { name: '软件包类型' }).getByRole('button', { name: /^Cask/ })).toHaveAttribute('aria-pressed', 'true');
});

test('light, dark, and system themes persist and follow the system color scheme', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'light' });
	await openPage(page);
	const theme = page.getByRole('combobox', { name: 'Color theme' });
	await expect(theme).toHaveAttribute('data-value', 'system');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
	for (const value of ['dark', 'light']) {
		await theme.click();
		await page
			.getByRole('option', {
				name: value === 'system' ? 'System' : value === 'light' ? 'Light' : 'Dark',
				exact: true,
			})
			.click();
		await expect(page.locator('html')).toHaveAttribute('data-theme', value);
		await expect.poll(() => page.evaluate(() => localStorage.getItem('tap-theme'))).toBe(value);
		await page.reload();
		await expect(theme).toHaveAttribute('data-value', value);
		await expect(page.locator('html')).toHaveAttribute('data-theme', value);
	}
	await theme.click();
	await page
		.getByRole('option', {
			name: 'System',
			exact: true,
		})
		.click();
	await page.emulateMedia({ colorScheme: 'dark' });
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	await expect.poll(() => page.evaluate(() => localStorage.getItem('tap-theme'))).toBe('system');
	await page.reload();
	await expect(theme).toHaveAttribute('data-value', 'system');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	await page.emulateMedia({ colorScheme: 'light' });
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('copying a command writes the exact text and provides accessible feedback', async ({ page }) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				writeText: async (text: string) => {
					(window as Window & { __copiedCommand?: string }).__copiedCommand = text;
				},
			},
		});
	});
	await openPage(page);
	await page.getByRole('button', { name: 'Copy command' }).click();
	await expect(page.locator('.copy-feedback[role="status"]')).toHaveText('Copied!');
	await expect.poll(() => page.evaluate(() => (window as Window & { __copiedCommand?: string }).__copiedCommand)).toBe(`brew tap ${appConfig.tap}`);
	await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();
});

test('clipboard rejection exposes manual-copy feedback without a browser error', async ({ page }) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				writeText: async () => {
					throw new DOMException('Permission denied', 'NotAllowedError');
				},
			},
		});
	});
	await openPage(page);
	await page.getByRole('button', { name: 'Copy command' }).click();
	await expect(page.locator('.copy-feedback[role="status"]')).toHaveText('Could not copy. Select and copy the command manually.');
	await expect(page.locator('.command code')).toHaveText(`brew tap ${appConfig.tap}`);
	await expect(page.getByRole('button', { name: 'Copy command' })).toBeVisible();
});

test('mobile catalog and direct detail pages do not overflow the viewport', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 812 });
	const paths = [route(), route('cask/')];
	if (selectedEntry) paths.push(packageRoute(selectedEntry));
	if (appConfig.i18n.locales.includes('zh-CN')) paths.push(route('', 'zh-CN'));
	for (const path of paths) {
		await openPage(page, path);
		await expect
			.poll(() => page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth), `No horizontal overflow at ${path}`)
			.toBeLessThanOrEqual(1);
		await expect(page.locator('.brand')).toBeVisible();
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await expect(page.locator('.language-link')).toBeVisible();
	}
});
