import { describe, expect, it } from 'vitest';
import { searchPackages, type CatalogEntry } from '../lib/search';

// Synthetic records belong only to this unit suite, never the generated catalog.
function entry(name: string, overrides: Partial<CatalogEntry> = {}): CatalogEntry {
	return {
		kind: 'formula',
		name,
		fullName: `example/tools/${name}`,
		displayName: name,
		desc: '',
		version: '1.0.0',
		aliases: [],
		updatedAt: null,
		...overrides,
	};
}

const entries = [
	entry('registry-proxy', { desc: 'A read-only Docker registry mirror', aliases: ['container-cache'], updatedAt: '2026-10-24T16:43:41Z' }),
	entry('image-viewer', { kind: 'cask', displayName: 'Image Studio', desc: 'Inspect container images', updatedAt: '2026-10-20T10:00:00Z' }),
	entry('archive-tool', { desc: 'Compress and extract files', updatedAt: '2026-10-22T10:00:00Z' }),
];

describe('catalog search', () => {
	it.each(['', ' ', '\t\n'])('returns all records for a blank query: %j', (query) => {
		expect(searchPackages(entries, query).map((item) => item.name)).toEqual(['registry-proxy', 'archive-tool', 'image-viewer']);
	});

	it.each([
		['REGISTRY-PROXY', 'registry-proxy'],
		['example/tools/archive-tool', 'archive-tool'],
		['image studio', 'image-viewer'],
		['read-only', 'registry-proxy'],
		['CONTAINER-CACHE', 'registry-proxy'],
	])('searches native names, full names, display names, descriptions, and aliases: %s', (query, name) => {
		expect(searchPackages(entries, query).map((item) => item.name)).toEqual([name]);
	});

	it('trims whitespace and matches every word, including words in separate fields', () => {
		expect(searchPackages(entries, '  DOCKER\tcontainer-cache\nexample/tools  ')).toEqual([entries[0]]);
		expect(searchPackages(entries, 'Docker missing')).toEqual([]);
	});

	it('treats punctuation as literal text, not a regular expression', () => {
		const versioned = entry('tool@2+kit', { aliases: ['[native]'] });
		expect(searchPackages([versioned], '@2+kit [native]')).toEqual([versioned]);
		expect(searchPackages([versioned], '.*')).toEqual([]);
	});

	it('supports non-ASCII display names and descriptions', () => {
		const localized = entry('editor', { kind: 'cask', displayName: '文本编辑器', desc: 'Éditeur de texte' });
		expect(searchPackages([localized], '编辑 ÉDITEUR')).toEqual([localized]);
	});

	it('does not accidentally search versions or timestamps', () => {
		expect(searchPackages(entries, '1.0.0')).toEqual([]);
		expect(searchPackages(entries, '2026-10')).toEqual([]);
	});

	it('combines query matching with formula and cask filters', () => {
		expect(searchPackages(entries, '', 'formula').map((item) => item.name)).toEqual(['registry-proxy', 'archive-tool']);
		expect(searchPackages(entries, 'container', 'cask')).toEqual([entries[1]]);
		expect(searchPackages(entries, 'Docker', 'cask')).toEqual([]);
		expect(searchPackages(entries, '', 'cask')).toEqual([entries[1]]);
	});

	it('keeps formula and cask identities distinct when names are shared', () => {
		const formula = entry('shared');
		const cask = entry('shared', { kind: 'cask' });
		expect(searchPackages([formula, cask], 'shared')).toEqual([cask, formula]);
		expect(searchPackages([formula, cask], 'shared', 'formula')).toEqual([formula]);
	});

	it('handles an empty tap without injecting placeholder packages', () => {
		expect(searchPackages([], '')).toEqual([]);
		expect(searchPackages([], 'anything', 'cask', 'name')).toEqual([]);
	});
});

describe('catalog sorting', () => {
	it('defaults to descending recipe update time', () => {
		const dated = [entry('alpha', { updatedAt: '2026-10-24T18:00:00+02:00' }), entry('zulu', { updatedAt: '2026-10-24T16:30:00Z' })];
		expect(searchPackages(dated, '').map((item) => item.name)).toEqual(['zulu', 'alpha']);
	});

	it('places missing and invalid dates after dated entries, with alphabetical ties', () => {
		const dated = [entry('zulu'), entry('beta', { updatedAt: 'not-a-date' }), entry('alpha', { updatedAt: undefined }), entry('recent', { updatedAt: '2026-10-24T16:00:00Z' })];
		expect(searchPackages(dated, '').map((item) => item.name)).toEqual(['recent', 'alpha', 'beta', 'zulu']);
	});

	it('breaks equal timestamps by name and then kind', () => {
		const updatedAt = '2026-10-24T16:00:00Z';
		const tied = [entry('beta', { updatedAt }), entry('alpha', { updatedAt }), entry('alpha', { kind: 'cask', updatedAt })];
		expect(searchPackages(tied, '').map((item) => `${item.kind}:${item.name}`)).toEqual(['cask:alpha', 'formula:alpha', 'formula:beta']);
	});

	it('sorts by name independently of update time when requested', () => {
		expect(searchPackages(entries, '', 'all', 'name').map((item) => item.name)).toEqual(['archive-tool', 'image-viewer', 'registry-proxy']);
	});

	it('returns a new array without mutating the catalog or cloning native identities', () => {
		const input = [...entries];
		const before = structuredClone(input);
		Object.freeze(input);
		const result = searchPackages(input, '', 'all', 'name');
		expect(result).not.toBe(input);
		expect(input).toEqual(before);
		expect(result[0]).toBe(entries[2]);
	});
});
