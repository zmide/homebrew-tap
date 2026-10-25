import { appConfig, entries, expect, expectRows, openPage, ordered, packageRoute, route, selectedEntry, snapshot, test } from './fixtures';

test('home shows only real generated packages and the configured tap command', async ({ page }) => {
	await openPage(page);
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(appConfig.brand.title.replace(/\s+/g, ' '));
	await expectRows(page, ordered(entries).slice(0, appConfig.recentLimit));
	await expect(page.locator('.tap-banner code')).toHaveText(`brew tap ${appConfig.tap}`);

	const nativeIdentities = [...snapshot.formulae.map((item) => `formula:${item.name}`), ...snapshot.casks.map((item) => `cask:${item.token}`)].sort();
	expect(entries.map((entry) => `${entry.kind}:${entry.name}`).sort()).toEqual(nativeIdentities);
});

test('search synchronizes the URL, reports an empty result, and clears back to recent packages', async ({ page }) => {
	await openPage(page);
	const input = page.getByRole('searchbox', { name: 'Search this tap' });
	const query = 'no-such-package-4f57d82e';
	expect(entries.some((entry) => JSON.stringify(entry).includes(query))).toBe(false);
	await input.fill(query);
	await expect(page).toHaveURL((url) => url.searchParams.get('q') === query);
	await expect(page.getByRole('heading', { name: 'No packages found' })).toBeVisible();
	await expect(page.locator('.package-row')).toHaveCount(0);
	await expect(page.locator('.results-heading [role="status"]')).toHaveText('0 packages');

	await page.reload();
	await expect(input).toHaveValue(query);
	await expect(page.getByRole('heading', { name: 'No packages found' })).toBeVisible();
	await page.locator('.empty-state').getByRole('button', { name: 'Clear filters' }).click();
	await expect(input).toHaveValue('');
	await expect(page).toHaveURL((url) => !url.searchParams.has('q') && !url.searchParams.has('type') && !url.searchParams.has('sort'));
	await expectRows(page, ordered(entries).slice(0, appConfig.recentLimit));
});

test('a real package query survives a direct URL load and can be cleared from the search field', async ({ page }) => {
	test.skip(!selectedEntry, 'This verified tap is empty');
	const entry = selectedEntry!;
	const expected = entries.filter((item) => [item.name, item.fullName, item.displayName, item.desc, ...item.aliases].join(' ').toLowerCase().includes(entry.name.toLowerCase()));
	await openPage(page, `${route()}?q=${encodeURIComponent(entry.name)}`);
	await expect(page.getByRole('searchbox')).toHaveValue(entry.name);
	await expectRows(page, ordered(expected));
	await page.locator('.search-box').getByRole('button', { name: 'Clear filters' }).click();
	await expect(page).toHaveURL((url) => !url.searchParams.has('q'));
	await expectRows(page, ordered(entries).slice(0, appConfig.recentLimit));
});

test('type filters match generated identities, including a genuinely empty cask collection', async ({ page }) => {
	await openPage(page);
	const casks = entries.filter((entry) => entry.kind === 'cask');
	const filters = page.getByRole('group', { name: 'Package type' });
	await filters.getByRole('button', { name: /^Casks/ }).click();
	await expect(filters.getByRole('button', { name: /^Casks/ })).toHaveAttribute('aria-pressed', 'true');
	await expect(page).toHaveURL((url) => url.searchParams.get('type') === 'cask');
	await expectRows(page, ordered(casks));
	if (casks.length === 0) await expect(page.getByRole('heading', { name: 'No packages found' })).toBeVisible();
	await page.reload();
	await expect(filters.getByRole('button', { name: /^Casks/ })).toHaveAttribute('aria-pressed', 'true');
	await expectRows(page, ordered(casks));
	await filters.getByRole('button', { name: /^All packages/ }).click();
	await expect(page).toHaveURL((url) => !url.searchParams.has('type'));
	await expectRows(page, ordered(entries).slice(0, appConfig.recentLimit));

	await openPage(page, route('cask/'));
	await expect(page.getByRole('heading', { level: 1, name: 'Casks' })).toBeVisible();
	await expectRows(page, ordered(casks));
});

test('sort order is URL-persisted and uses the generated recipe dates and names', async ({ page }) => {
	await openPage(page);
	const sort = page.getByRole('combobox', { name: 'Sort packages' });
	await sort.click();
	await page
		.getByRole('option', {
			name: 'Name A–Z',
			exact: true,
		})
		.click();
	await expect(page).toHaveURL((url) => url.searchParams.get('sort') === 'name');
	await expectRows(page, ordered(entries, 'name'));
	await page.reload();
	await expect(sort).toHaveAttribute('data-value', 'name');
	await expectRows(page, ordered(entries, 'name'));
	await sort.click();
	await page
		.getByRole('option', {
			name: 'Recently updated',
			exact: true,
		})
		.click();
	await expect(page).toHaveURL((url) => !url.searchParams.has('sort'));
	await expectRows(page, ordered(entries).slice(0, appConfig.recentLimit));
});

test('search and result navigation work using the keyboard', async ({ page }) => {
	test.skip(!selectedEntry, 'This verified tap is empty');
	const entry = selectedEntry!;
	await openPage(page);
	await page.keyboard.press('ControlOrMeta+k');
	const input = page.getByRole('searchbox');
	await expect(input).toBeFocused();
	await input.fill(entry.name);
	await input.press('ArrowDown');
	await expect(page.locator('.package-row').first()).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(input).toBeFocused();
	await input.press('Escape');
	await expect(input).toHaveValue('');
	await expect(page).toHaveURL((url) => !url.searchParams.has('q'));

	await input.fill(entry.fullName);
	await input.press('Enter');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL((url) => url.pathname === packageRoute(entry));
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(entry.displayName);
});
