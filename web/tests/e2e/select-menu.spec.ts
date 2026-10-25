import { expect, openPage, packageRoute, selectedEntry, test } from './fixtures';

test('custom menus support keyboard selection, Escape and outside dismissal', async ({ page }) => {
	await openPage(page);
	expect(await page.locator('select').count()).toBe(0);
	const theme = page.getByRole('combobox', { name: 'Color theme' });
	await theme.focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('listbox')).toBeVisible();
	await page.keyboard.press('End');
	await page.keyboard.press('Enter');
	await expect(theme).toHaveAttribute('data-value', 'dark');
	await expect(theme).toBeFocused();
	await theme.click();
	await page.keyboard.press('Escape');
	await expect(theme).toHaveAttribute('aria-expanded', 'false');
	await theme.click();
	await page.getByRole('heading', { level: 1 }).click();
	await expect(theme).toHaveAttribute('aria-expanded', 'false');
});

test('platform evidence and readable variant names are visible on detail pages', async ({ page }) => {
	test.skip(!selectedEntry, 'A real package is required');
	await openPage(page, packageRoute(selectedEntry!));
	await expect(page.getByRole('heading', { name: 'Platform support', exact: true })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Package details', exact: true })).toHaveCount(0);
	const emptyGroups = await page.locator('article section').evaluateAll(
		(sections) =>
			sections.filter((section) => {
				const body = section.cloneNode(true) as HTMLElement;
				body.querySelectorAll('h2, h3').forEach((heading) => heading.remove());
				return !body.textContent?.trim();
			}).length,
	);
	expect(emptyGroups).toBe(0);
	expect(await page.locator('select').count()).toBe(0);
	await expect(page.getByRole('combobox', { name: 'Platform configuration' })).toHaveCount(0);
});
