import { describe, expect, it } from 'vitest';
import { badgePath, defaultBadgeOptions, normalizeBadgeOptions, packageBadge, type BadgeOptions } from '../lib/homebrew/badges';
import type { HomebrewPackage, PackageKind } from '../lib/homebrew/types';

const formula = { name: 'tool@2+kit.1', full_name: 'example/tools/tool@2+kit.1', versions: { stable: '2.1' }, revision: 2 };
const site = { origin: 'https://example.com', basePath: '/tap/' };
const badge = (options: Partial<BadgeOptions> = {}) => packageBadge('formula', formula, { ...defaultBadgeOptions, ...options }, site)!;

describe('package badge URLs', () => {
	it('encodes each path segment, separates kinds and rejects unsafe names', () => {
		expect(badgePath('formula', formula.name)).toBe('/badges/formula/tool%402%2Bkit.1.json');
		expect(badgePath('cask', formula.name)).toBe('/badges/cask/tool%402%2Bkit.1.json');
		expect(badgePath('formula', '../bad')).toBeUndefined();
		expect(packageBadge('formula', { name: '--bad' }, defaultBadgeOptions, site)).toBeUndefined();
	});
	it('uses a stable public endpoint URL without pinning the current version', () => {
		const value = badge();
		const url = new URL(value.imageUrl);
		expect(url.pathname).toBe('/endpoint');
		expect(url.searchParams.get('url')).toBe('https://example.com/tap/badges/formula/tool%402%2Bkit.1.json');
		expect(value.detailUrl).toBe('https://example.com/tap/formula/tool%402%2Bkit.1/');
		expect(value.imageUrl).not.toContain('2.1');
		expect(new URL(value.previewUrl).searchParams.get('message')).toBe('2.1_2');
		expect(value.markdown).toBe(`[![${value.alt}](${value.imageUrl})](${value.detailUrl})`);
	});
	it('previews pkg_version, HEAD, cask versions, latest and unknown without altering native records', () => {
		for (const [kind, item, expected] of [
			['formula', { ...formula, pkg_version: '2.1_7' }, '2.1_7'],
			['formula', { ...formula, versions: { stable: null, head: 'HEAD' } }, 'HEAD'],
			['formula', { name: 'tool' }, 'unknown'],
			['cask', { token: 'tool', name: ['Tool'], version: '4.0,120' }, '4.0,120'],
			['cask', { token: 'tool', name: ['Tool'], version: 'latest' }, 'latest'],
		] as Array<[PackageKind, HomebrewPackage, string]>) {
			const before = structuredClone(item);
			const value = packageBadge(kind, item, defaultBadgeOptions, site)!;
			expect(new URL(value.previewUrl).searchParams.get('message')).toBe(expected);
			expect(value.unknownVersion).toBe(expected === 'unknown');
			if (value.unknownVersion) expect(new URL(value.previewUrl).searchParams.get('color')).toBe('lightgrey');
			expect(item).toEqual(before);
		}
	});
	it('keeps the default version image URL stable when versions become known or unknown', () => {
		const unknown = packageBadge('formula', { name: formula.name, full_name: formula.full_name }, defaultBadgeOptions, site)!;
		expect(unknown.imageUrl).toBe(badge().imageUrl);
		expect(new URL(unknown.imageUrl).searchParams.has('color')).toBe(false);
		expect(new URL(badge({ color: 'blue' }).imageUrl).searchParams.get('color')).toBe('blue');
	});
	it('supports root and alternate deployment base paths independently of locale', () => {
		for (const basePath of ['/', '/second/deployment/']) {
			const value = packageBadge('formula', formula, defaultBadgeOptions, { ...site, basePath })!;
			expect(value.detailUrl).toBe(`${site.origin}${basePath}formula/tool%402%2Bkit.1/`);
			expect(value.endpointUrl).toBe(`${site.origin}${basePath}badges/formula/tool%402%2Bkit.1.json`);
		}
	});
	it('uses static images for package names and safely encoded custom text and appearance', () => {
		expect(new URL(badge({ mode: 'name' }).imageUrl).searchParams.get('message')).toBe(formula.name);
		const value = badge({ mode: 'custom', message: '支持 & [brew](x) + <svg>', label: '', style: 'flat-square', color: 'a0B1c2' });
		const url = new URL(value.imageUrl);
		expect(url.pathname).toBe('/static/v1');
		expect(url.searchParams.get('message')).toBe('支持 & [brew](x) + <svg>');
		expect(url.searchParams.get('label')).toBe('');
		expect(url.searchParams.get('style')).toBe('flat-square');
		expect(url.searchParams.get('color')).toBe('a0B1c2');
		expect(url.searchParams.has('url')).toBe(false);
		expect(value.imageUrl).not.toContain('<svg>');
	});
	it('normalizes unsupported styles, colors, controls, long and empty text', () => {
		const settings = normalizeBadgeOptions({ mode: 'bad', style: 'bad', color: 'red&url=evil', label: '\nleft\t', message: ' ' } as unknown as BadgeOptions);
		expect(settings).toEqual({ ...defaultBadgeOptions, label: 'left' });
		expect(normalizeBadgeOptions({ ...defaultBadgeOptions, message: 'a'.repeat(100) }).message).toHaveLength(80);
	});
});
