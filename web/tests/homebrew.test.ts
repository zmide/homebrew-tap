import { describe, expect, it } from 'vitest';
import {
	apiPath,
	bottleRows,
	dependencyGroups,
	dependencyLink,
	displayName,
	formatValue,
	fullName,
	hasValue,
	identity,
	installCommand,
	packageName,
	packageNotices,
	packagePath,
	rosettaRequirement,
	safeExternalUrl,
	sourceLink,
	validSourcePath,
	variationEntries,
	version,
	withVariation,
} from '../lib/homebrew/helpers';
import type { Cask, Formula, HomebrewPackage, SearchEntry } from '../lib/homebrew/types';
import englishLabels from '../locales/en/detail.json';
import chineseLabels from '../locales/zh-CN/detail.json';

const commit = 'a'.repeat(40);
const formula: Formula = {
	name: 'sample@2',
	full_name: 'example/tools/sample@2',
	tap: 'example/tools',
	desc: 'A native formula',
	versions: { stable: '2.4.0', head: 'HEAD', bottle: true },
	revision: 2,
	aliases: ['sample'],
	ruby_source_path: 'Formula/s/sample@2.rb',
	tap_git_head: commit,
	dependencies: ['openssl@3', 'example/tools/helper'],
	build_dependencies: ['pkgconf'],
	test_dependencies: ['python@3.13'],
	optional_dependencies: ['graphviz'],
	recommended_dependencies: ['readline'],
	runtime_dependencies: [{ full_name: 'openssl@3', version: '3.5.0' }],
	uses_from_macos: ['zlib', { bison: 'build' }],
	bottle: {
		stable: {
			rebuild: 1,
			files: {
				arm64_sequoia: { cellar: ':any_skip_relocation', url: 'https://ghcr.io/v2/example/tools/sample/blobs/sha256:abc', sha256: 'b'.repeat(64) },
				x86_64_linux: { cellar: '/home/linuxbrew/.linuxbrew/Cellar', url: 'file:///private/bottle.tar.gz', sha256: 'c'.repeat(64) },
			},
		},
	},
	variations: {
		arm64_linux: { dependencies: ['linux-only'], bottle: { stable: { files: {} } }, future_field: { enabled: true } },
		sonoma: { versions: { stable: '2.3.0' }, service: null },
	},
	future_native_field: { nested: ['retained', 42] },
};

const cask: Cask = {
	token: 'sample-app',
	full_token: 'example/tools/sample-app',
	tap: 'example/tools',
	name: ['Sample App', 'Sample Application'],
	desc: 'A native cask',
	version: '4.0,120',
	ruby_source_path: 'Casks/s/sample-app.rb',
	tap_git_head: commit,
	depends_on: { formula: ['imagemagick'], cask: ['another-app'], macos: { '>=': ['12'] } },
	artifacts: [{ app: ['Sample.app'] }, { uninstall: [{ quit: 'org.example.Sample' }] }],
	auto_updates: false,
	requires_rosetta: true,
	languages: ['en', 'zh-CN'],
	supported_platforms: [['arm64', 'sequoia']],
	variations: {},
	unknown_cask_field: 'native value',
};

describe('native Homebrew identities and versions', () => {
	it('uses the formula name and full_name without changing the native record', () => {
		expect(packageName('formula', formula)).toBe('sample@2');
		expect(fullName('formula', formula)).toBe('example/tools/sample@2');
		expect(identity('formula', formula)).toBe('formula:example/tools/sample@2');
		expect(displayName('formula', formula)).toBe('sample@2');
		expect(version('formula', formula)).toBe('2.4.0_2');
		expect(formula.future_native_field).toEqual({ nested: ['retained', 42] });
	});

	it('uses cask token identity and its human-readable name separately', () => {
		expect(packageName('cask', cask)).toBe('sample-app');
		expect(fullName('cask', cask)).toBe('example/tools/sample-app');
		expect(identity('cask', cask)).toBe('cask:example/tools/sample-app');
		expect(displayName('cask', cask)).toBe('Sample App');
		expect(version('cask', cask)).toBe('4.0,120');
		expect(displayName('cask', { ...cask, name: [] })).toBe('sample-app');
	});

	it('prefers native pkg_version and supports HEAD, latest, and unknown versions', () => {
		expect(version('formula', { ...formula, pkg_version: '2.4.0_7' })).toBe('2.4.0_7');
		expect(version('formula', { ...formula, versions: { stable: null, head: 'HEAD' } })).toBe('HEAD');
		expect(version('formula', { ...formula, versions: { stable: null, head: null } })).toBe('—');
		expect(version('formula', { ...formula, revision: 0 })).toBe('2.4.0');
		expect(version('cask', { ...cask, version: 'latest' })).toBe('latest');
	});

	it('reconstructs a missing full name from native tap metadata', () => {
		expect(fullName('formula', { ...formula, full_name: undefined })).toBe('example/tools/sample@2');
		expect(fullName('cask', { ...cask, full_token: undefined })).toBe('example/tools/sample-app');
		expect(fullName('formula', { name: 'hello' })).toBe('hello');
	});

	it('exports the search contract without converting native package records', () => {
		const entry: SearchEntry = {
			kind: 'formula',
			name: formula.name,
			fullName: fullName('formula', formula),
			displayName: displayName('formula', formula),
			desc: formula.desc ?? '',
			version: version('formula', formula),
			aliases: formula.aliases ?? [],
			updatedAt: null,
		};
		expect(entry.name).toBe('sample@2');
		expect(entry.updatedAt).toBeNull();
	});
});

describe('installation and native routes', () => {
	it('qualifies both formula and cask installation commands', () => {
		expect(installCommand('formula', formula)).toBe('brew install example/tools/sample@2');
		expect(installCommand('cask', cask)).toBe('brew install --cask example/tools/sample-app');
	});

	it('does not put unsafe or option-like package names in a shell command', () => {
		expect(installCommand('formula', { name: '--help' })).toBe('');
		expect(installCommand('formula', { name: 'hello; rm -rf x' })).toBe('');
		expect(installCommand('cask', { token: 'bad$(cmd)', name: [] })).toBe('');
		expect(installCommand('formula', { ...formula, full_name: 'evil;cmd' })).toBe('brew install example/tools/sample@2');
	});

	it('encodes native versioned names and rejects path traversal', () => {
		expect(packagePath('formula', 'sample@2')).toBe('/formula/sample%402/');
		expect(packagePath('cask', 'sample-app')).toBe('/cask/sample-app/');
		expect(packagePath('formula', '../secret')).toBeUndefined();
		expect(packagePath('formula', 'a/b')).toBeUndefined();
		expect(apiPath('formula', 'sample@2')).toBe('/api/formula/sample%402.json');
		expect(apiPath('cask', 'sample-app')).toBe('/api/cask/sample-app.json');
		expect(apiPath('formula', '../secret')).toBeUndefined();
	});
});

describe('safe external links', () => {
	it.each(['https://example.com/download?a=1&b=2', 'http://example.com/path', 'HTTPS://EXAMPLE.COM/file'])('allows absolute HTTP(S) links: %s', (url) => {
		expect(safeExternalUrl(url)).toBe(new URL(url).href);
	});

	it.each([
		'javascript:alert(1)',
		'data:text/html,hello',
		'file:///etc/passwd',
		'ftp://example.com/file',
		'//example.com',
		'/relative',
		' https://example.com',
		'https://example.com/has space',
		'https://user:password@example.com',
		'https://example.com\\@evil.test',
		'https://example.com/\nfile',
		'https://',
	])('rejects unsafe or non-web links: %s', (url) => {
		expect(safeExternalUrl(url)).toBeUndefined();
	});

	it('handles absent and non-string values', () => {
		expect(safeExternalUrl(null)).toBeUndefined();
		expect(safeExternalUrl({ url: 'https://example.com' })).toBeUndefined();
	});
});

describe('dependency destinations', () => {
	const options = { tap: 'example/tools', localPath: (path: string) => `/tap/zh-CN${path}` };

	it('links current-tap dependencies through the locale/base-path helper', () => {
		expect(dependencyLink('example/tools/sample@2', 'formula', options)).toEqual({ href: '/tap/zh-CN/formula/sample%402/', external: false });
		expect(dependencyLink('example/tools/sample-app', 'cask', options)).toEqual({ href: '/tap/zh-CN/cask/sample-app/', external: false });
	});

	it('treats unqualified dependencies as core unless explicitly known to be local', () => {
		expect(dependencyLink('openssl@3', 'formula', options)?.href).toBe('https://formulae.brew.sh/formula/openssl%403');
		expect(dependencyLink('firefox', 'cask', options)?.href).toBe('https://formulae.brew.sh/cask/firefox');
		expect(dependencyLink('sample@2', 'formula', { ...options, localPackages: [{ kind: 'formula', name: 'sample@2' }] })).toEqual({
			href: '/tap/zh-CN/formula/sample%402/',
			external: false,
		});
	});

	it('respects qualified core/cask identities and uses a real repository for third-party taps', () => {
		expect(dependencyLink('homebrew/core/cmake', 'formula', options)?.href).toBe('https://formulae.brew.sh/formula/cmake');
		expect(dependencyLink('homebrew/cask/firefox', 'formula', options)?.href).toBe('https://formulae.brew.sh/cask/firefox');
		expect(dependencyLink('other/tools/tool', 'formula', options)).toEqual({
			href: 'https://github.com/other/homebrew-tools/search?q=tool%20language%3ARuby&type=code',
			external: true,
		});
		expect(dependencyLink('javascript:alert(1)', 'formula', options)).toBeUndefined();
		expect(dependencyLink('example/tools/../evil', 'formula', options)).toBeUndefined();
	});

	it('preserves dependency categories rather than conflating build/test/runtime requirements', () => {
		const groups = dependencyGroups('formula', formula);
		expect(groups.map((group) => group.key)).toEqual([
			'dependencies',
			'build_dependencies',
			'test_dependencies',
			'recommended_dependencies',
			'optional_dependencies',
			'runtime_dependencies',
			'uses_from_macos',
		]);
		expect(groups.find((group) => group.key === 'runtime_dependencies')?.dependencies).toEqual([{ name: 'openssl@3', kind: 'formula', detail: '3.5.0' }]);
		expect(groups.find((group) => group.key === 'uses_from_macos')?.dependencies).toContainEqual({ name: 'bison', kind: 'formula', detail: 'build' });
		expect(dependencyGroups('formula', { name: 'minimal' })).toEqual([]);
	});

	it('distinguishes cask formula and cask dependencies from platform requirements', () => {
		expect(dependencyGroups('cask', cask)).toEqual([
			{ key: 'formula_dependencies', dependencies: [{ name: 'imagemagick', kind: 'formula' }] },
			{ key: 'cask_dependencies', dependencies: [{ name: 'another-app', kind: 'cask' }] },
		]);
	});
});

describe('validated, commit-pinned native source links', () => {
	it('uses the configured tap repository and actual nested native source path', () => {
		expect(sourceLink('formula', formula, 'https://github.com/example/homebrew-tools')).toBe(
			`https://github.com/example/homebrew-tools/blob/${commit}/Formula/s/sample%402.rb`,
		);
		expect(sourceLink('cask', cask, 'https://github.com/example/homebrew-tools.git/')).toBe(`https://github.com/example/homebrew-tools/blob/${commit}/Casks/s/sample-app.rb`);
		expect(validSourcePath('cask', 'Cask/sample.rb')).toBe(true);
	});

	it.each([
		'../Formula/sample.rb',
		'Formula/../sample.rb',
		'Formula/./sample.rb',
		'/Formula/sample.rb',
		'Formula\\sample.rb',
		'Formula/%2e%2e/sample.rb',
		'Formula/sample.txt',
		'Casks/sample.rb',
		'Formula//sample.rb',
	])('rejects an unsafe formula source path: %s', (path) => {
		expect(sourceLink('formula', { ...formula, ruby_source_path: path }, 'https://github.com/example/homebrew-tools')).toBeUndefined();
	});

	it('does not guess branches, source filenames, or unsupported repository hosts', () => {
		for (const head of ['main', '../main', '', 'a'.repeat(39)])
			expect(sourceLink('formula', { ...formula, tap_git_head: head }, 'https://github.com/example/homebrew-tools')).toBeUndefined();
		for (const repository of [
			'javascript:alert(1)',
			'http://github.com/example/homebrew-tools',
			'https://github.com.evil.test/example/homebrew-tools',
			'https://github.com/example/homebrew-tools/tree/main',
			'https://github.com/example/homebrew-tools?x=y',
		])
			expect(sourceLink('formula', formula, repository)).toBeUndefined();
		expect(sourceLink('formula', { ...formula, ruby_source_path: undefined }, 'https://github.com/example/homebrew-tools')).toBeUndefined();
	});
});

describe('native platform variation deltas', () => {
	it('uses a shallow top-level override and keeps unknown fields', () => {
		const selected = withVariation(formula, 'arm64_linux');
		expect(selected.dependencies).toEqual(['linux-only']);
		expect(selected.bottle).toEqual({ stable: { files: {} } });
		expect(selected.future_field).toEqual({ enabled: true });
		expect(selected.future_native_field).toBe(formula.future_native_field);
		expect(selected.variations).toBe(formula.variations);
		expect(formula.dependencies).toEqual(['openssl@3', 'example/tools/helper']);
	});

	it('does not deep-merge replaced nested metadata and respects null overrides', () => {
		const selected = withVariation({ ...formula, service: { run: ['bin/service'] } }, 'sonoma');
		expect(selected.versions).toEqual({ stable: '2.3.0' });
		expect(selected.service).toBeNull();
	});

	it('keeps the original native record for the default/unknown variation', () => {
		expect(withVariation(formula)).toBe(formula);
		expect(withVariation(formula, 'missing')).toBe(formula);
		expect(variationEntries(cask)).toEqual([]);
		expect(variationEntries({ ...formula, variations: { good: {}, malformed: null } } as unknown as HomebrewPackage)).toEqual([['good', {}]]);
	});
});

describe('bottle availability, not platform support', () => {
	it('lists only native bottle targets and sanitizes download links', () => {
		const rows = bottleRows(formula);
		expect(rows.map((row) => row.target)).toEqual(['arm64_sequoia', 'x86_64_linux']);
		expect(rows[0]?.url).toMatch(/^https:\/\/ghcr.io\//);
		expect(rows[1]?.url).toBeUndefined();
		expect(bottleRows(cask)).toEqual([]);
		expect(bottleRows(withVariation(formula, 'arm64_linux'))).toEqual([]);
	});
});

describe('disabled/deprecated notices', () => {
	const now = new Date('2026-10-25T23:00:00Z');

	it('shows dated future changes as scheduled, even when a native boolean is already set', () => {
		expect(
			packageNotices({ ...formula, disabled: true, disable_date: '2027-01-01', disable_reason: 'unmaintained', disable_replacement_cask: 'example/tools/sample-app' }, now),
		).toEqual([{ type: 'disable', scheduled: true, date: '2027-01-01', reason: 'unmaintained', replacements: [{ name: 'example/tools/sample-app', kind: 'cask' }] }]);
	});

	it('marks today/past changes as active and includes same-kind replacements', () => {
		expect(
			packageNotices(
				{ ...formula, deprecated: false, deprecation_date: '2026-10-25', deprecation_reason: 'versioned_formula', deprecation_replacement_formula: 'sample@3' },
				now,
			),
		).toEqual([{ type: 'deprecate', scheduled: false, date: '2026-10-25', reason: 'versioned_formula', replacements: [{ name: 'sample@3', kind: 'formula' }] }]);
	});

	it('handles boolean-only notices and rejects invalid dates', () => {
		expect(packageNotices({ ...cask, deprecated: true }, now)[0]).toMatchObject({ type: 'deprecate', scheduled: false });
		expect(packageNotices({ ...formula, disable_date: '2026-02-31' }, now)).toEqual([]);
		expect(packageNotices(formula, now)).toEqual([]);
	});

	it('reads scheduled reasons and replacements from native deprecate_args/disable_args', () => {
		expect(
			packageNotices(
				{
					...formula,
					deprecation_date: '2030-04-08',
					deprecation_reason: null,
					deprecate_args: { date: '2030-04-08', because: 'unmaintained', replacement_formula: 'new-formula' },
				},
				now,
			),
		).toEqual([{ type: 'deprecate', scheduled: true, date: '2030-04-08', reason: 'unmaintained', replacements: [{ name: 'new-formula', kind: 'formula' }] }]);
	});
});

describe('native Rosetta metadata', () => {
	it('reads the actual caveats_rosetta field without guessing from platform names', () => {
		expect(rosettaRequirement({ ...cask, caveats_rosetta: true, requires_rosetta: undefined })).toBe(true);
		expect(rosettaRequirement({ ...cask, caveats_rosetta: false })).toBe(false);
		expect(rosettaRequirement({ ...cask, caveats_rosetta: null, requires_rosetta: undefined })).toBeUndefined();
	});
});

describe('text-only native value display', () => {
	it('preserves literal caveats/service text for Vue to escape, never parses HTML', () => {
		expect(formatValue('<script>alert(1)</script>')).toBe('<script>alert(1)</script>');
		expect(formatValue({ run: ['/bin/service', '--flag'] })).toContain('"--flag"');
		expect(formatValue(null)).toBe('');
	});

	it('hides empty fields without hiding explicit false/zero values', () => {
		for (const value of [null, undefined, '', '   ', [], {}]) expect(hasValue(value)).toBe(false);
		for (const value of [false, 0, ['en'], { run: [] }]) expect(hasValue(value)).toBe(true);
	});
});

describe('detail translations', () => {
	it('keeps every detail key available in both supported locales', () => {
		expect(Object.keys(chineseLabels).sort()).toEqual(Object.keys(englishLabels).sort());
		expect(Object.values(englishLabels).every((value) => typeof value === 'string' && value.trim())).toBe(true);
		expect(Object.values(chineseLabels).every((value) => typeof value === 'string' && value.trim())).toBe(true);
	});
});
