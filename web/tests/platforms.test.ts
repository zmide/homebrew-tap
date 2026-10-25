import { describe, expect, it } from 'vitest';
import { binaryPlatforms, platformMetadata, platformName } from '../lib/homebrew/platforms';

describe('platform evidence', () => {
	it('lists binary assets including the default platform, without inventing support for source archives', () => {
		expect(
			binaryPlatforms({
				name: 'tool',
				urls: { stable: { url: 'https://example.com/tool_darwin_arm64.tar.gz' } },
				variations: { x86_64_linux: { urls: { stable: { url: 'https://example.com/tool_linux_amd64.tar.gz' } } } },
			}),
		).toEqual([
			{ system: 'macOS', architecture: 'Apple Silicon' },
			{ system: 'Linux', architecture: 'x86_64' },
		]);
		expect(binaryPlatforms({ name: 'source', urls: { stable: { url: 'https://example.com/source.tar.gz' } } })).toEqual([]);
	});
	it('labels native platform tags without treating download filenames as support', () => {
		expect(platformName('arm64_sonoma')).toBe('macOS 14 (sonoma) / Apple Silicon');
		expect(platformName('sequoia')).toBe('macOS 15 (sequoia) / Intel');
		expect(platformName('arm64_linux')).toBe('Linux / ARM64');
		expect(platformName('future_target')).toBe('future_target');
	});
	it('ignores unsafe URLs and platform-looking query strings or directory names', () => {
		for (const url of [
			'javascript:tool_linux_arm64.tar.gz',
			'file:///tool_linux_arm64.tar.gz',
			'https://user:pass@example.com/tool_linux_arm64.tar.gz',
			'https://example.com/source.tar.gz?asset=tool_linux_arm64.tar.gz',
			'https://example.com/tool_linux_arm64/source.tar.gz',
		])
			expect(binaryPlatforms({ name: 'tool', urls: { stable: { url } } })).toEqual([]);
	});
	it('deduplicates inherited URLs and respects top-level variation replacements', () => {
		expect(
			binaryPlatforms({
				name: 'tool',
				urls: { stable: { url: 'https://example.com/tool_macos_aarch64.tar.gz' } },
				variations: { arm64_linux: { dependencies: [] }, sonoma: { urls: null }, sequoia: { urls: { head: { url: 'https://example.com/tool_linux_amd64.tar.gz' } } } },
			}),
		).toEqual([{ system: 'macOS', architecture: 'Apple Silicon' }]);
	});
	it('keeps system requirements separate from variants and bottles', () => {
		const result = platformMetadata({
			name: 'sample',
			requirements: [{ name: 'linux' }, { name: 'arch', version: 'arm64' }],
			variations: { x86_64_linux: {} },
			bottle: { stable: { files: { arm64_sonoma: {} } } },
		});
		expect(result.requirements).toHaveLength(2);
		expect(result.variations).toEqual([{ name: 'x86_64_linux', label: 'Linux / x86_64' }]);
		expect(result.declared).toEqual({});
	});
	it('retains cask system bounds without confusing dependencies with support', () => {
		expect(platformMetadata({ token: 'app', name: ['App'], depends_on: { macos: { '>=': ['13'] }, arch: ['arm64'], formula: ['tool'] } }).declared).toEqual({
			macos: { '>=': ['13'] },
			arch: ['arm64'],
		});
	});
});
