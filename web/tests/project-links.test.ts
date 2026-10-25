import { describe, expect, it } from 'vitest';
import { projectLinks } from '../lib/homebrew/project-links';
import type { Formula } from '../lib/homebrew/types';
import snapshot from '../../scripts/catalog/fixtures/info.v2.raw?raw';

const repository = 'https://github.com/example/tool';
const expected = { repository, releases: `${repository}/releases` };

describe('derived project links', () => {
	it('derives the real project links without config, network requests or native mutations', () => {
		const item: Formula = JSON.parse(snapshot).formulae[0];
		const copy = structuredClone(item);
		expect(projectLinks(item)).toEqual({ repository: 'https://github.com/runui/oci-mirror-proxy', releases: 'https://github.com/runui/oci-mirror-proxy/releases' });
		expect(item).toEqual(copy);
	});
	it.each([`${repository}/releases/download/v1/tool.tar.gz`, `${repository}/archive/refs/tags/v1.tar.gz`, `${repository}.git`])('recognizes a native stable URL: %s', (url) => {
		expect(projectLinks({ name: 'tool', urls: { stable: { url } } })).toEqual(expected);
	});
	it('reads cask downloads, HEAD repositories, homepage fallbacks and variation URLs', () => {
		expect(projectLinks({ token: 'app', name: ['App'], url: `${repository}/releases/download/v1/app.dmg` })).toEqual(expected);
		expect(projectLinks({ name: 'tool', urls: { head: { url: `${repository}.git` } } })).toEqual(expected);
		expect(projectLinks({ name: 'tool', homepage: `${repository}/` })).toEqual(expected);
		expect(projectLinks({ name: 'tool', variations: { arm64_linux: { urls: { stable: { url: `${repository}/archive/v1.tar.gz` } } } } })).toEqual(expected);
	});
	it('prefers package downloads to a different documentation repository', () => {
		expect(projectLinks({ name: 'tool', homepage: 'https://github.com/example/docs', urls: { stable: { url: `${repository}/archive/v1.tar.gz` } } })).toEqual(expected);
	});
	it('does not guess between conflicting upstream repositories', () => {
		expect(
			projectLinks({ name: 'tool', homepage: repository, urls: { stable: { url: `${repository}/archive/v1.tar.gz` }, head: { url: 'https://github.com/other/tool.git' } } }),
		).toEqual({});
	});
	it.each([
		'javascript:alert(1)',
		'file:///tmp/tool_linux_arm64.tar.gz',
		'https://user:password@github.com/example/tool',
		'https://github.com.evil.test/example/tool',
		'https://example.com/tool.tar.gz',
		'https://github.com/example',
		'https://github.com/example/tool/issues',
		'https://github.com/example/tool:443',
		'http://github.com/example/tool',
		'https://github.com:444/example/tool',
	])('does not invent project links for an unsafe or unrecognized URL: %s', (url) => {
		expect(projectLinks({ name: 'tool', homepage: url, urls: { stable: { url } } })).toEqual({});
	});
	it('honors safe overrides without leaving releases pointed at a different project', () => {
		const item = { name: 'tool', homepage: repository };
		expect(projectLinks(item, { repository: 'https://github.com/other/project' })).toEqual({
			repository: 'https://github.com/other/project',
			releases: 'https://github.com/other/project/releases',
		});
		expect(projectLinks(item, { repository: 'https://example.com/source' })).toEqual({ repository: 'https://example.com/source' });
		expect(projectLinks(item, { releases: 'https://example.com/downloads' })).toEqual({ repository, releases: 'https://example.com/downloads' });
		expect(projectLinks(item, { repository: 'javascript:alert(1)', releases: 'file:///tmp/releases' })).toEqual(expected);
	});
});
