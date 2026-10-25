import { readFileSync } from 'node:fs';
import { test as base, expect, type ConsoleMessage, type Page } from '@playwright/test';
import type { CatalogEntry } from '../../lib/search';
import { appConfig, basePath } from './settings.mjs';

function generated(name: string): unknown {
	try {
		return JSON.parse(readFileSync(new URL(`../../.generated/${name}`, import.meta.url), 'utf8'));
	} catch (cause) {
		throw new Error(`Missing or invalid generated ${name}. Build a real catalog (or explicitly supply a verified native snapshot) before running browser tests.`, {
			cause,
		});
	}
}

const index = generated('search-index.json');
if (!Array.isArray(index)) throw new Error('The generated search index must be an array');
export const entries = index as CatalogEntry[];
export type NativeRecord = Record<string, unknown>;
export const snapshot = generated('info.v2.json') as { formulae: NativeRecord[]; casks: NativeRecord[] };
if (!Array.isArray(snapshot.formulae) || !Array.isArray(snapshot.casks)) throw new Error('A native Homebrew v2 snapshot with formulae and casks arrays is required');
export const selectedEntry = entries[0];
export { appConfig, basePath };

export function route(path = '', locale = appConfig.i18n.defaultLocale): string {
	const prefix = locale === appConfig.i18n.defaultLocale ? '' : `${locale}/`;
	return `${basePath}${prefix}${path.replace(/^\//, '')}`;
}

export function packageRoute(entry: CatalogEntry, locale = appConfig.i18n.defaultLocale): string {
	return route(`${entry.kind}/${encodeURIComponent(entry.name)}/`, locale);
}

export function ordered(items: CatalogEntry[], sort = 'updated'): CatalogEntry[] {
	return [...items].sort((a, b) => {
		const dates = sort === 'updated' ? (Date.parse(b.updatedAt || '') || 0) - (Date.parse(a.updatedAt || '') || 0) : 0;
		return dates || a.name.localeCompare(b.name, 'en') || a.kind.localeCompare(b.kind);
	});
}

export async function openPage(page: Page, path = route()) {
	const response = await page.goto(path);
	expect(response?.status()).toBe(200);
	// Do not type into server-rendered inputs before Vue has attached handlers.
	await page.waitForFunction(() => Boolean((document.querySelector('#__nuxt') as (Element & { __vue_app__?: unknown }) | null)?.__vue_app__));
	return response!;
}

export async function expectRows(page: Page, expected: CatalogEntry[]) {
	await expect(page.locator('.package-row')).toHaveCount(expected.length);
	const hrefs = await page.locator('.package-row').evaluateAll((rows) => rows.map((row) => row.getAttribute('href')));
	expect(hrefs).toEqual(expected.map((entry) => packageRoute(entry)));
}

export const test = base.extend<{ browserHealth: void }>({
	browserHealth: [
		async ({ page }, use) => {
			const problems: string[] = [];
			const pageError = (error: Error) => problems.push(`pageerror: ${error.message}`);
			const consoleMessage = (message: ConsoleMessage) => {
				if (message.type() === 'error' || /hydrat(?:ion|e).*mismatch|mismatch.*hydrat/i.test(message.text())) problems.push(`${message.type()}: ${message.text()}`);
			};
			page.on('pageerror', pageError);
			page.on('console', consoleMessage);
			await use();
			page.off('pageerror', pageError);
			page.off('console', consoleMessage);
			expect(problems, 'No browser errors, console errors, or hydration mismatches').toEqual([]);
		},
		{ auto: true },
	],
});

export { expect };
