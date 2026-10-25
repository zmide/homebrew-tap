import { describe, expect, it } from 'vitest';
import { noteBlocks, platformSupport, uniqueLinks, visibleArtifacts } from '../lib/homebrew/detail-view';
import type { Cask, Formula } from '../lib/homebrew/types';
import snapshot from '../../scripts/catalog/fixtures/info.v2.raw?raw';

describe('detail presentation', () => {
	it('shows explicit binary availability without treating it as a compatibility declaration', () => {
		const item: Formula = { name: 'tool', urls: { stable: { url: 'https://example.com/tool_linux_arm64.tar.gz' } }, variations: { arm64_linux: { dependencies: [] } } };
		expect(platformSupport('formula', item)).toEqual([{ system: 'Linux', source: '', architectures: [{ name: 'ARM64', status: 'supported', availability: 'download' }] }]);
		expect(platformSupport('formula', { name: 'tool', variations: item.variations })).toEqual([]);
		expect(platformSupport('formula', { name: 'tool', urls: { stable: { url: 'https://example.com/source.tar.gz' } } })).toEqual([]);
	});
	it('uses validated declarations including the default platform without mutating them', () => {
		const declarations = [
			{
				system: 'macOS',
				architectures: [
					{ name: 'Apple Silicon', status: 'supported' },
					{ name: 'Intel', status: 'unsupported' },
				],
				source: 'https://example.com/support',
			},
		];
		const copy = structuredClone(declarations);
		expect(platformSupport('formula', { name: 'tool' }, declarations)[0]?.architectures).toEqual(declarations[0]!.architectures);
		expect(declarations).toEqual(copy);
		expect(platformSupport('formula', { name: 'tool' }, [{ ...declarations[0]!, source: 'javascript:alert(1)' }])).toEqual([]);
	});
	it('keeps bottle targets exact and does not infer unsupported platforms', () => {
		const item: Formula = { name: 'tool', bottle: { stable: { files: { arm64_sonoma: { url: 'https://example.com/tool.bottle.tar.gz' } } } } };
		const groups = platformSupport('formula', item);
		expect(groups).toHaveLength(1);
		expect(groups[0]?.bottleTargets).toEqual(['arm64_sonoma']);
		expect(groups[0]?.architectures).toEqual([{ name: 'Apple Silicon', status: 'supported', availability: 'bottle' }]);
	});
	it('derives all four binary platforms from the real export without configuration or mutation', () => {
		const item: Formula = JSON.parse(snapshot).formulae[0];
		const copy = structuredClone(item);
		const groups = platformSupport('formula', item);
		expect(groups.find((group) => group.system === 'macOS')?.architectures).toEqual([
			{ name: 'Apple Silicon', status: 'supported', availability: 'download' },
			{ name: 'Intel', status: 'supported', availability: 'download' },
		]);
		expect(groups.find((group) => group.system === 'Linux')?.architectures).toEqual([
			{ name: 'x86_64', status: 'supported', availability: 'download' },
			{ name: 'ARM64', status: 'supported', availability: 'download' },
		]);
		expect(item).toEqual(copy);
	});
	it('allows reviewed overrides while retaining unrelated native evidence', () => {
		const declarations = [{ system: 'macOS', source: 'https://example.com/support', architectures: [{ name: 'Apple Silicon', status: 'unsupported' }] }];
		const copy = structuredClone(declarations);
		const groups = platformSupport(
			'formula',
			{
				name: 'tool',
				urls: { stable: { url: 'https://example.com/tool_darwin_arm64.tar.gz' } },
				bottle: { stable: { files: { sonoma: { url: 'https://example.com/tool.bottle.tar.gz' } } } },
			},
			declarations,
		);
		expect(groups[0]?.architectures).toEqual([
			{ name: 'Apple Silicon', status: 'unsupported' },
			{ name: 'Intel', status: 'supported', availability: 'bottle' },
		]);
		expect(declarations).toEqual(copy);
	});
	it('shows unknown cask architectures and readable native minimum versions', () => {
		const cask: Cask = { token: 'app', name: ['App'], depends_on: { macos: { '>=': ['13'] } } };
		expect(platformSupport('cask', cask)[0]).toMatchObject({
			system: 'macOS',
			minimum: '>= 13',
			architectures: [
				{ name: 'Apple Silicon', status: 'unknown' },
				{ name: 'Intel', status: 'unknown' },
			],
		});
	});
	it('does not treat build-only or optional OS requirements as runtime support', () => {
		expect(
			platformSupport('formula', {
				name: 'tool',
				requirements: [
					{ name: 'macos', contexts: ['build'] },
					{ name: 'linux', optional: true },
				],
			}),
		).toEqual([]);
	});
	it('applies architecture limits after creating OS requirement groups', () => {
		const groups = platformSupport('formula', {
			name: 'tool',
			requirements: [
				{ name: 'macos', version: '13' },
				{ name: 'arch', version: 'arm64' },
			],
		});
		expect(groups[0]?.architectures).toEqual([
			{ name: 'Apple Silicon', status: 'unknown' },
			{ name: 'Intel', status: 'unsupported' },
		]);
		expect(platformSupport('cask', { token: 'app', name: ['App'], depends_on: { arch: ['arm64'] } })[0]?.architectures).toEqual([
			{ name: 'Apple Silicon', status: 'supported' },
			{ name: 'Intel', status: 'unsupported' },
		]);
	});
	it('merges variation-specific architecture limits without making them global exclusions', () => {
		const item: Cask = {
			token: 'app',
			name: ['App'],
			depends_on: { arch: [{ type: 'arm64' }], macos: { '>=': ['14'] } },
			variations: { sonoma: { depends_on: { arch: [{ type: 'x86_64' }], macos: { '>=': ['13'] } } } },
		};
		expect(platformSupport('cask', item)[0]).toEqual({
			system: 'macOS',
			source: '',
			architectures: [
				{ name: 'Apple Silicon', status: 'supported' },
				{ name: 'Intel', status: 'supported' },
			],
		});
		expect(platformSupport('cask', { ...item, depends_on: { arch: ['future_arch'] }, variations: {} })[0]?.architectures.every((arch) => arch.status === 'unknown')).toBe(true);
	});
	it('reads runtime OS requirements in variations without leaking them to other systems', () => {
		const groups = platformSupport('formula', {
			name: 'tool',
			urls: { stable: { url: 'https://example.com/tool_darwin_arm64.tar.gz' } },
			requirements: [{ name: 'macos', version: '13' }],
			variations: {
				arm64_linux: {
					urls: { stable: { url: 'https://example.com/tool_linux_arm64.tar.gz' } },
					requirements: [{ name: 'linux' }, { name: 'arch', version: 'arm64' }],
				},
			},
		});
		expect(groups.find((group) => group.system === 'macOS')?.minimum).toBe('>= 13');
		expect(groups.find((group) => group.system === 'Linux')?.architectures).toEqual([
			{ name: 'ARM64', status: 'supported', availability: 'download' },
			{ name: 'x86_64', status: 'unsupported' },
		]);
	});
	it('filters empty artifact children but preserves meaningful false and zero', () => {
		expect(
			visibleArtifacts({
				token: 'app',
				name: ['App'],
				artifacts: [
					{ app: [], binary: null },
					{ flag: false, count: 0 },
				],
			}),
		).toEqual([
			['flag', false],
			['count', 0],
		]);
	});
	it('separates unambiguous commands without promoting arbitrary indented text to shell', () => {
		expect(noteBlocks('Before starting:\n  tool init\n\nExplanation:\n  not a command\n\nSee:\n  https://example.com')).toEqual([
			{ type: 'text', value: 'Before starting:' },
			{ type: 'command', value: 'tool init' },
			{ type: 'text', value: 'Explanation:' },
			{ type: 'pre', value: 'not a command' },
			{ type: 'text', value: 'See:\n  https://example.com' },
		]);
		expect(noteBlocks('  ')).toEqual([]);
	});
	it('omits missing and duplicate links', () => {
		expect(uniqueLinks([{ href: undefined }, { href: '/api/tool.json' }, { href: '/api/tool.json' }])).toEqual([{ href: '/api/tool.json' }]);
	});
});
