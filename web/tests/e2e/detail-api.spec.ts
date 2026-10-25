import { readFileSync } from 'node:fs';
import { entries, expect, openPage, packageRoute, route, selectedEntry, snapshot, test } from './fixtures';
import { basePath, baseURL } from './settings.mjs';

test('a package detail is prerendered and can be loaded and refreshed directly', async ({ page, request }) => {
	test.skip(!selectedEntry, 'This verified tap is empty');
	const entry = selectedEntry!;
	const path = packageRoute(entry);
	const html = await request.get(path);
	expect(html.status()).toBe(200);
	expect(html.headers()['content-type']).toContain('text/html');
	expect(await html.text()).toContain(entry.name);

	await openPage(page, path);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(entry.displayName);
	await expect(page.locator('.command code')).toHaveText(`brew install ${entry.kind === 'cask' ? '--cask ' : ''}${entry.fullName}`);
	const nativeJson = page.locator('article details').filter({ has: page.locator('summary', { hasText: 'Native package JSON' }) });
	await nativeJson.locator('summary').click();
	await expect(page.getByRole('link', { name: 'Native JSON API', exact: false })).toHaveAttribute('href', `${basePath}api/${entry.kind}/${encodeURIComponent(entry.name)}.json`);
	await page.reload();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(entry.displayName);
});

test('each package keeps its qualified install command and native sections', async ({ page }) => {
	test.skip(!entries.length, 'This verified tap is empty');
	for (const entry of entries) {
		await openPage(page, packageRoute(entry));
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(entry.displayName);
		await expect(page.locator('.command code')).toHaveText(`brew install ${entry.kind === 'cask' ? '--cask ' : ''}${entry.fullName}`);
		await expect(page.locator('article aside').getByRole('heading', { name: 'Package information', exact: true })).toBeVisible();
		if (entry.version) await expect(page.locator('article aside dl')).toContainText(entry.version);
		const native = (entry.kind === 'formula' ? snapshot.formulae : snapshot.casks).find((item) => (entry.kind === 'formula' ? item.name : item.token) === entry.name)!;
		if (native.caveats) await expect(page.getByRole('heading', { name: 'Caveats', exact: true })).toBeVisible();
		if (native.service) await expect(page.getByRole('heading', { name: 'Service', exact: true })).toBeVisible();
	}
});

test('catalog and direct package content remain available without JavaScript', async ({ browser }) => {
	const context = await browser.newContext({ javaScriptEnabled: false });
	try {
		const page = await context.newPage();
		await page.goto(baseURL);
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		if (selectedEntry) {
			await page.goto(new URL(packageRoute(selectedEntry), page.url()).href);
			await expect(page.getByRole('heading', { level: 1 })).toHaveText(selectedEntry.displayName);
			await expect(page.locator('.command code')).toContainText(selectedEntry.fullName);
		}
	} finally {
		await context.close();
	}
});

test('published array and individual APIs equal native snapshot objects without sidecar contamination', async ({ request }) => {
	for (const kind of ['formula', 'cask'] as const) {
		const expected = kind === 'formula' ? snapshot.formulae : snapshot.casks;
		const response = await request.get(`${basePath}api/${kind}.json`);
		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toContain('application/json');
		const collection = await response.json();
		expect(Array.isArray(collection)).toBe(true);
		expect(collection).toEqual(expected);
		for (const [index, record] of expected.entries()) {
			const name = String(kind === 'formula' ? record.name : record.token);
			const individual = await request.get(`${basePath}api/${kind}/${encodeURIComponent(name)}.json`);
			expect(individual.status()).toBe(200);
			expect(individual.headers()['content-type']).toContain('application/json');
			const object = await individual.json();
			expect(object).toEqual(collection[index]);
			expect(object).toEqual(record);
			for (const sidecar of ['updatedAt', 'links', 'displayName', 'fullName', 'kind']) {
				if (!(sidecar in record)) expect(object).not.toHaveProperty(sidecar);
			}
		}
	}
});

test('snapshot-mode coverage uses the explicitly generated native snapshot, never a default fixture', async ({ request }) => {
	const manifest = JSON.parse(readFileSync(new URL('../../.generated/manifest.json', import.meta.url), 'utf8'));
	expect(manifest.counts).toEqual({ formula: snapshot.formulae.length, cask: snapshot.casks.length });
	for (const entry of manifest.routes) {
		const response = await request.get(`${basePath}${entry.apiPath}`);
		expect(response.status()).toBe(200);
		const record = await response.json();
		expect(entry.kind === 'formula' ? record.name : record.token).toBe(entry.name);
	}
});

test('missing routes and APIs are real 404s rather than an index.html SPA fallback', async ({ request }) => {
	for (const path of [route('formula/no-such-package-4f57d82e/'), `${basePath}api/cask/no-such-package-4f57d82e.json`]) {
		const response = await request.get(path);
		expect(response.status()).toBe(404);
		const fallback = readFileSync(new URL('../../.output/public/404.html', import.meta.url), 'utf8');
		expect(await response.text()).toBe(fallback);
	}
	if (basePath !== '/') {
		expect((await request.get('/')).status()).toBe(404);
		expect((await request.get('/api/formula.json')).status()).toBe(404);
	}
});

test('the static mount serves its real assets with browser-usable MIME types', async ({ page, request }) => {
	await openPage(page);
	const assets = await page
		.locator('script[src], link[rel="stylesheet"][href]')
		.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('src') || node.getAttribute('href') || '').filter(Boolean));
	expect(assets.length).toBeGreaterThan(0);
	for (const asset of assets) {
		expect(new URL(asset, page.url()).pathname).toMatch(new RegExp(`^${basePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
		const response = await request.get(new URL(asset, page.url()).href);
		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toMatch(asset.endsWith('.css') ? /text\/css/ : /(?:javascript|json)/);
	}
});
