import { appConfig, expect, openPage, packageRoute, selectedEntry, test } from './fixtures';

test('commands use GitHub colors in both themes without changing their text', async ({ page }) => {
	await openPage(page);
	const code = page.locator('.command code');
	await expect(code).toHaveText(`brew tap ${appConfig.tap}`);
	await expect(code).toHaveAttribute('data-language', 'bash');
	const firstToken = code.locator('span[style]').first();
	await expect(firstToken).toHaveText('brew');
	const theme = page.getByRole('combobox', { name: 'Color theme' });
	for (const [mode, color] of [
		['light', 'rgb(111, 66, 193)'],
		['dark', 'rgb(179, 146, 240)'],
	]) {
		await theme.click();
		await page
			.getByRole('option', {
				name: mode! === 'system' ? 'System' : mode! === 'light' ? 'Light' : 'Dark',
				exact: true,
			})
			.click();
		await expect(firstToken).toHaveCSS('color', color!);
		await expect(code).toHaveText(`brew tap ${appConfig.tap}`);
	}
});

test('native JSON is highlighted in prerendered HTML with original text intact', async ({ page, request }) => {
	test.skip(!selectedEntry, 'This verified tap is empty');
	const path = packageRoute(selectedEntry!);
	const html = await (await request.get(path)).text();
	expect(html).toContain('--shiki-light:');
	expect(html).toContain('--shiki-dark:');
	await openPage(page, path);
	const details = page.locator('article details').filter({ has: page.locator('summary', { hasText: 'Native package JSON' }) });
	await details.locator('summary').click();
	const json = details.locator('pre[data-language="json"] code');
	await expect(json.locator('span[style]').first()).toBeVisible();
	expect(JSON.parse(await json.innerText())).toHaveProperty(selectedEntry!.kind === 'formula' ? 'name' : 'token', selectedEntry!.name);
});
