import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packageRoute, parsePackageRoute, versionedPackage, visiblePackages } from '../shared/homebrew-package-routes.mjs';

test('fixed version routes round trip without conflating version lines', () => {
	for (const kind of ['formula', 'cask']) {
		for (const version of ['1.2.0', '1.3.0-beta.1', '1.1.2-beta5']) {
			const name = `foo@${version}`;
			const path = `/${kind}/foo/v/${version}/`;
			assert.equal(packageRoute(kind, name), path);
			assert.deepEqual(parsePackageRoute(path), { kind, name });
			assert.deepEqual(parsePackageRoute(`/${kind}/foo%40${version}/`), { kind, name });
		}
	}
	assert.equal(packageRoute('formula', 'foo@2'), '/formula/foo%402/');
	assert.equal(versionedPackage('foo@2').fixed, false);
	assert.equal(versionedPackage('foo-beta'), undefined);
});

test('invalid paths never resolve to a package or fall back to latest', () => {
	for (const path of [
		'/other/foo/',
		'/formula/foo/v/latest/',
		'/formula/foo/v/2/',
		'/formula/foo/v/1.2.0/extra',
		'/formula/%ZZ/',
		'/formula/foo%2fbar/',
		'/formula/foo@2/v/1.2.0/',
		'/formula/../',
	])
		assert.equal(parsePackageRoute(path), undefined, path);
	assert.equal(packageRoute('formula', '../foo'), undefined);
	assert.deepEqual(parsePackageRoute('/'), {});
});

test('discovery selects a single representative without changing native entries', () => {
	const entries = ['foo@1.0.0', 'foo@2.0.0', 'foo', 'foo-beta', 'bar@1.9.0', 'bar@1.10.0', 'bar@2.0.0-beta.1'].map((name) => ({ kind: 'formula', name }));
	entries.push({ kind: 'cask', name: 'foo@1.0.0' });
	const before = structuredClone(entries);
	assert.deepEqual(
		visiblePackages(entries).map((entry) => `${entry.kind}:${entry.name}`),
		['formula:foo', 'formula:foo-beta', 'formula:bar@1.10.0', 'cask:foo@1.0.0'],
	);
	assert.deepEqual(entries, before);
	assert.deepEqual(
		visiblePackages([...entries].reverse())
			.map((entry) => `${entry.kind}:${entry.name}`)
			.sort(),
		visiblePackages(entries)
			.map((entry) => `${entry.kind}:${entry.name}`)
			.sort(),
	);
});
