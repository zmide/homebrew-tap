import { expect, openPage, packageRoute, selectedEntry, snapshot, appConfig, test } from './fixtures';
import { platformSupport } from '../../lib/homebrew/detail-view';
import { projectLinks } from '../../lib/homebrew/project-links';
import type { HomebrewPackage } from '../../lib/homebrew/types';

test('native platform availability and project links render without supplemental config', async ({ page }) => {
	test.skip(!selectedEntry, 'A package is required');
	const entry = selectedEntry!;
	const identity = `${entry.kind}:${entry.fullName}`;
	test.skip(Boolean(appConfig.links?.[identity] || appConfig.platformSupport?.[identity]), 'This package uses explicit overrides');
	const native = (entry.kind === 'formula' ? snapshot.formulae : snapshot.casks).find(
		(item) => (entry.kind === 'formula' ? item.name : item.token) === entry.name,
	) as HomebrewPackage;
	await openPage(page, packageRoute(entry));
	const support = page.getByRole('region', { name: 'Platform support' });
	for (const platform of platformSupport(entry.kind, native)) {
		const heading = support.getByRole('heading', { name: platform.system, exact: true });
		await expect(heading).toBeVisible();
		const system = heading.locator('../..');
		for (const arch of platform.architectures.filter((arch) => arch.availability)) {
			await expect(system.locator('li').filter({ hasText: arch.name })).toContainText(arch.availability === 'download' ? 'Binary available' : 'Bottle available');
		}
	}
	for (const href of Object.values(projectLinks(native))) await expect(page.locator(`aside a[href="${href}"]`)).toHaveCount(1);
});

test('support is not a table and only primary URLs are clickable', async ({ page }) => {
	test.skip(!selectedEntry, 'A package is required');
	await openPage(page, packageRoute(selectedEntry!));
	const support = page.getByRole('region', { name: 'Platform support' });
	await expect(support).toBeVisible();
	await expect(support.locator('table, [role="combobox"], pre')).toHaveCount(0);
	const links = page.locator('aside section').filter({ has: page.getByRole('heading', { name: 'Project links', exact: true }) });
	for (const heading of await links.locator('h3').all()) {
		expect(await heading.evaluate((node) => Boolean(node.closest('a')))).toBe(false);
	}
	await expect(page.getByRole('link', { name: 'Native JSON API', exact: false })).toHaveCount(1);
	await expect(page.locator('article a[target="_blank"]')).toHaveCount(0);
	for (const image of await support.locator('img').all()) {
		expect(await image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
		const offset = await image.evaluate((node) => {
			const image = node.getBoundingClientRect();
			const title = node.parentElement!.nextElementSibling!.getBoundingClientRect();
			return Math.abs(image.y + image.height / 2 - title.y - title.height / 2);
		});
		expect(offset).toBeLessThanOrEqual(1);
	}
	for (const list of await support.locator('ul').all()) {
		const rows = await list.locator('li').all();
		if (rows.length > 1) {
			const first = await rows[0]!.boundingBox();
			const second = await rows[1]!.boundingBox();
			expect(second!.y - first!.y - first!.height).toBeGreaterThanOrEqual(12);
		}
	}
});

test('help supports keyboard, pointer, Escape, outside dismissal and touch-sized screens', async ({ page }) => {
	test.skip(!selectedEntry, 'A package is required');
	await page.setViewportSize({ width: 320, height: 900 });
	await openPage(page, packageRoute(selectedEntry!));
	const help = page.getByRole('button', { name: 'About Last publish' });
	test.skip(!(await help.count()), 'This package has no update date');
	await help.scrollIntoViewIfNeeded();
	await help.focus();
	await expect(help).toHaveAttribute('aria-expanded', 'true');
	const tooltip = page.getByRole('tooltip').filter({ hasText: 'The last Git commit' });
	await expect(tooltip).toBeVisible();
	const icon = await help.locator('svg').boundingBox();
	expect(icon!.width).toBeLessThanOrEqual(14);
	expect(icon!.height).toBeLessThanOrEqual(14);
	const label = await help.locator('..').locator('..').locator('span').first().boundingBox();
	expect(Math.abs(icon!.y + icon!.height / 2 - label!.y - label!.height / 2)).toBeLessThanOrEqual(1);
	const box = await tooltip.boundingBox();
	expect(box!.x).toBeGreaterThanOrEqual(0);
	expect(box!.x + box!.width).toBeLessThanOrEqual(320);
	await page.keyboard.press('Escape');
	await expect(tooltip).toBeHidden();
	await help.click();
	await expect(tooltip).toBeVisible();
	await page.getByRole('heading', { level: 1 }).click();
	await expect(tooltip).toBeHidden();
});

test('service configuration has a visible title-to-code gap and platform downloads are absent', async ({ page }) => {
	test.skip(!selectedEntry, 'A package is required');
	await openPage(page, packageRoute(selectedEntry!));
	const title = page.getByRole('heading', { name: 'Exported service configuration', exact: false });
	if (await title.count()) {
		const gap = await title.evaluate((heading) => {
			const code = heading.parentElement!.querySelector('pre')!;
			return code.getBoundingClientRect().top - heading.getBoundingClientRect().bottom;
		});
		expect(gap).toBeGreaterThanOrEqual(8);
	}
	await expect(page.locator('summary', { hasText: 'Platform downloads' })).toHaveCount(0);
});

test('touch help toggles and platform configuration controls are absent', async ({ browser }) => {
	test.skip(!selectedEntry, 'A package is required');
	const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 900 } });
	try {
		const page = await context.newPage();
		await openPage(page, packageRoute(selectedEntry!));
		const help = page.getByRole('button', { name: 'About Last publish' });
		if (!(await help.count())) return;
		await help.tap();
		await expect(help).toHaveAttribute('aria-expanded', 'true');
		await help.tap();
		await expect(help).toHaveAttribute('aria-expanded', 'false');
		await expect(page.getByRole('combobox', { name: 'Platform configuration' })).toHaveCount(0);
	} finally {
		await context.close();
	}
});

test('mobile puts installation before support and metadata after body without duplicates', async ({ page }) => {
	test.skip(!selectedEntry, 'A package is required');
	await page.setViewportSize({ width: 390, height: 900 });
	await openPage(page, packageRoute(selectedEntry!));
	const install = await page.getByRole('heading', { name: 'Install with Homebrew', exact: true }).boundingBox();
	const support = await page.getByRole('heading', { name: 'Platform support', exact: true }).boundingBox();
	const metadata = await page.getByRole('heading', { name: 'Package information', exact: true }).boundingBox();
	expect(install!.y).toBeLessThan(support!.y);
	expect(support!.y).toBeLessThan(metadata!.y);
	await expect(page.getByRole('heading', { name: 'Install with Homebrew', exact: true })).toHaveCount(1);
});
