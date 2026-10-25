import { appConfig, entries, expect, openPage, packageRoute, route, selectedEntry, snapshot, test } from './fixtures';
import { dependencyViews } from '../../lib/homebrew/detail-view';
import type { HomebrewPackage } from '../../lib/homebrew/types';

for (const width of [1440, 1024, 768, 390, 320]) {
	test(`compact header and readable catalog typography at ${width}px in both themes and languages`, async ({ page }) => {
		await page.setViewportSize({ width, height: 900 });
		for (const locale of appConfig.i18n.locales) {
			for (const colorScheme of ['light', 'dark'] as const) {
				await page.emulateMedia({ colorScheme });
				await openPage(page, route('', locale));
				await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
				const header = page.locator('.site-header');
				expect((await header.boundingBox())!.height).toBe(width <= 680 ? 64 : 72);
				await expect(header.locator('nav, a[href$="/formula/"], a[href$="/cask/"]')).toHaveCount(0);
				await expect(header.locator('.theme-menu svg')).toHaveClass(/lucide-moon/);
				for (const icon of await header.locator('.header-actions svg').all()) {
					await expect(icon).toHaveCSS('width', '18px');
					await expect(icon).toHaveCSS('height', '18px');
					await expect(icon).toHaveAttribute('stroke-width', '1.75');
					await expect(icon).toHaveAttribute('aria-hidden', 'true');
				}
				await expect(page.locator('.hero h1')).toHaveCSS('font-weight', '600');
				await expect(page.locator('.hero h1')).toHaveCSS('font-size', width <= 680 ? '28px' : '34px');
				await expect(page.locator('.hero h1')).toHaveCSS('line-height', width <= 680 ? '34px' : '41px');
				await expect(page.getByRole('searchbox')).toHaveCSS('font-size', '17px');
				await expect(page.getByRole('searchbox')).toHaveCSS('line-height', '26px');
				await expect(page.locator('.filter-tabs button').first()).toHaveCSS('font-size', '15px');
				await expect(page.locator('.filter-tabs button').first()).toHaveCSS('line-height', '22px');
				if (entries.length) {
					await expect(page.locator('.package-title > span').first()).toHaveCSS('font-size', '17px');
					await expect(page.locator('.package-title > span').first()).toHaveCSS('line-height', '24px');
					await expect(page.locator('.package-title > span').first()).toHaveCSS('font-weight', '600');
					await expect(page.locator('.package-info p').first()).toHaveCSS('font-size', '15px');
					await expect(page.locator('.package-info p').first()).toHaveCSS('line-height', '22px');
				}
				const alignment = await header.evaluate((node) => {
					const header = node.getBoundingClientRect();
					const brand = node.querySelector('.brand')!.getBoundingClientRect();
					const actions = node.querySelector('.header-actions')!.getBoundingClientRect();
					const center = header.top + header.height / 2;
					return {
						brand: Math.abs(brand.top + brand.height / 2 - center),
						actions: Math.abs(actions.top + actions.height / 2 - center),
						gap: actions.left - brand.right,
					};
				});
				expect(alignment.brand).toBeLessThanOrEqual(1);
				expect(alignment.actions).toBeLessThanOrEqual(1);
				expect(alignment.gap).toBeGreaterThanOrEqual(8);
				expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(1);
			}
		}
	});
}

test('catalog rows never underline text, but keep separators, hover feedback and keyboard focus', async ({ page }) => {
	test.skip(!selectedEntry, 'A real package is required');
	await openPage(page);
	const row = page.locator('.package-row').first();
	await row.hover();
	await expect(row).toHaveCSS('text-decoration-line', 'none');
	await expect(row).toHaveCSS('border-bottom-width', '1px');
	await expect(row).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
	await page.getByRole('searchbox').focus();
	await page.keyboard.press('ArrowDown');
	await expect(row).toBeFocused();
	await expect(row).toHaveCSS('text-decoration-line', 'none');
	await expect(row).toHaveCSS('outline-style', 'solid');
	await row.evaluate((node) => node.addEventListener('click', (event) => event.preventDefault(), { once: true }));
	await page.mouse.down();
	await expect(row).toHaveCSS('text-decoration-line', 'none');
	await page.mouse.up();
});

test('browse-all is spaced 24px below the list and preserves its existing sort behavior', async ({ page }) => {
	test.skip(entries.length <= appConfig.recentLimit, 'The verified catalog has no browse-all control; the demo covers this layout');
	for (const width of [1440, 390, 320]) {
		await page.setViewportSize({ width, height: 900 });
		await openPage(page);
		const browse = page.locator('.browse-all');
		await expect(browse).toBeVisible();
		const gap = await browse.evaluate((node) => node.getBoundingClientRect().top - node.parentElement!.querySelector('.package-list')!.getBoundingClientRect().bottom);
		expect(gap).toBeCloseTo(24, 0);
		await browse.click();
		await expect(page).toHaveURL((url) => url.searchParams.get('sort') === 'name');
		await expect(page.locator('.package-row')).toHaveCount(entries.length);
		await expect(browse).toHaveCount(0);
	}
});

test('platform states use text-sized icons centered with labels and preserve detail typography', async ({ page }) => {
	test.skip(!selectedEntry, 'A real package is required');
	for (const width of [1440, 1024, 1023, 768, 681, 680, 390, 320]) {
		await page.setViewportSize({ width, height: 900 });
		for (const locale of appConfig.i18n.locales) {
			await openPage(page, packageRoute(selectedEntry!, locale));
			await expect(page.locator('article h1')).toHaveCSS('font-size', width <= 680 ? '28px' : '34px');
			await expect(page.locator('article h1')).toHaveCSS('line-height', width <= 680 ? '34px' : '41px');
			await expect(page.locator('article h2').first()).toHaveCSS('font-size', '22px');
			await expect(page.locator('article h2').first()).toHaveCSS('line-height', '28px');
			await expect(page.locator('article .command code').first()).toHaveCSS('font-size', '14px');
			await expect(page.locator('article .command code').first()).toHaveCSS('line-height', '22px');
			const rows = page.locator('li[data-status]');
			for (const row of await rows.all()) {
				await expect(row).toHaveCSS('font-size', '15px');
				await expect(row).toHaveCSS('line-height', '22px');
				const icon = row.locator('svg');
				const status = await row.getAttribute('data-status');
				await expect(icon).toHaveClass(new RegExp(`lucide-circle-${status === 'supported' ? 'check' : status === 'unsupported' ? 'x' : 'minus'}`));
				await expect(icon).toHaveAttribute('aria-hidden', 'true');
				const metrics = await icon.evaluate((svg) => {
					const icon = svg.getBoundingClientRect();
					const text = svg.nextElementSibling!.getBoundingClientRect();
					return {
						width: icon.width,
						height: icon.height,
						font: parseFloat(getComputedStyle(svg.parentElement!).fontSize),
						center: Math.abs(icon.top + icon.height / 2 - text.top - text.height / 2),
						gap: text.left - icon.right,
					};
				});
				expect(metrics.width).toBe(metrics.font);
				expect(metrics.height).toBe(metrics.font);
				expect(metrics.center).toBeLessThanOrEqual(1);
				expect(metrics.gap).toBeCloseTo(6, 0);
			}
			expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(1);
		}
	}
});

test('metadata labels retain one line and supporting paragraphs do not add trailing space', async ({ page }) => {
	test.skip(!selectedEntry, 'A real package is required');
	for (const width of [1440, 1024, 390, 320]) {
		await page.setViewportSize({ width, height: 900 });
		for (const locale of appConfig.i18n.locales) {
			await openPage(page, packageRoute(selectedEntry!, locale));
			const updated = page.locator('article aside dt').filter({ has: page.locator('button', { has: page.locator('svg.lucide-circle-help') }) });
			for (const term of await updated.all()) {
				const label = term.locator(':scope > span > span').first();
				expect(await label.evaluate((node) => node.getBoundingClientRect().height)).toBeCloseTo(22, 0);
			}
			for (const term of await page.locator('article aside dt').all()) {
				const offset = await term.evaluate((node) => {
					const label = node.getBoundingClientRect();
					const value = node.nextElementSibling!.getBoundingClientRect();
					return Math.abs(label.y + label.height / 2 - value.y - value.height / 2);
				});
				expect(offset, 'Metadata labels and values are vertically centered in each row').toBeLessThanOrEqual(1);
			}
			const support = page.locator('section[aria-label]').filter({ has: page.locator('li[data-status]') });
			for (const note of await support.locator(':scope > p').all()) {
				await expect(note).toHaveCSS('margin-top', '16px');
				if (await note.evaluate((node) => node === node.parentElement!.lastElementChild)) await expect(note).toHaveCSS('margin-bottom', '0px');
			}
		}
	}
});

test('tap command fits its content rather than stretching across the banner', async ({ page }) => {
	for (const width of [1440, 768, 390, 320]) {
		await page.setViewportSize({ width, height: 900 });
		for (const locale of appConfig.i18n.locales) {
			await openPage(page, route('', locale));
			const metrics = await page.locator('.tap-banner').evaluate((banner) => {
				const command = banner.querySelector('.command')!;
				const code = command.querySelector('code')!;
				const button = command.querySelector('button')!;
				const range = document.createRange();
				range.selectNodeContents(code);
				return {
					gap: button.getBoundingClientRect().left - range.getBoundingClientRect().right,
					right: command.getBoundingClientRect().right,
					bannerRight: banner.getBoundingClientRect().right,
				};
			});
			expect(metrics.gap).toBeCloseTo(8, 0);
			expect(metrics.right).toBeLessThanOrEqual(metrics.bannerRight);
		}
	}
});

test('desktop copy controls stay compact and empty feedback reserves no vertical space', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	for (const path of [route(), ...(selectedEntry ? [packageRoute(selectedEntry)] : [])]) {
		await openPage(page, path);
		for (const button of await page.locator('.command button, .code-copy, [data-package-badge] button').all()) {
			const box = (await button.boundingBox())!;
			expect(box.width).toBe(32);
			expect(box.height).toBe(32);
			await expect(button).toHaveCSS('padding-top', '0px');
			await expect(button).toHaveCSS('padding-bottom', '0px');
		}
		for (const feedback of await page.locator('.command-wrap > .copy-feedback:empty').all())
			expect(await feedback.evaluate((node) => node.getBoundingClientRect().height)).toBe(0);
	}
});

test('dependency variants, categories and lists follow the site spacing scale', async ({ page }) => {
	const entry = entries.find((entry) => {
		const record = (entry.kind === 'formula' ? snapshot.formulae : snapshot.casks).find((item) => (entry.kind === 'formula' ? item.name : item.token) === entry.name);
		return record && dependencyViews(entry.kind, record as HomebrewPackage).length;
	});
	test.skip(!entry, 'The verified catalog has no dependency section; multi-category and multi-platform demo layouts are checked separately');
	for (const width of [1440, 390, 320]) {
		await page.setViewportSize({ width, height: 900 });
		await openPage(page, packageRoute(entry!));
		const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Dependencies', level: 2, exact: true }) });
		const groups = section.locator(':scope > div');
		await expect(groups).toHaveCSS('gap', '24px');
		const titleGap = await groups.evaluate((node) => node.getBoundingClientRect().top - node.previousElementSibling!.getBoundingClientRect().bottom);
		expect(titleGap).toBeCloseTo(16, 0);
		for (const variant of await groups.locator(':scope > div').all()) {
			await expect(variant).toHaveCSS('gap', '12px');
			const categories = variant.locator(':scope > div');
			await expect(categories).toHaveCSS('gap', '16px');
			for (const category of await categories.locator(':scope > div').all()) {
				await expect(category).toHaveCSS('gap', '8px');
				await expect(category.locator('ul')).toHaveCSS('row-gap', '8px');
				await expect(category.locator('ul')).toHaveCSS('column-gap', '16px');
				await expect(category.locator('ul')).toHaveCSS('margin-top', '0px');
			}
		}
	}
});
