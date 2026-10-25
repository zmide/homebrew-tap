import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, copyFile, cp, symlink, utimes, rename, stat } from 'node:fs/promises';
import { tmpdir, release } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConfig, validateName, validateBasePath } from './config.mjs';
import { validateNative, validateSourcePath, routePath } from './native.mjs';
import { assertSnapshotSources, discoverSources, run, sha256, sourceUpdatedAt } from './sources.mjs';
import { brewEnvironment, exportCatalog, provenancePath } from './export.mjs';
import { buildCatalog, makeSearchEntry, reusableSnapshot } from './build.mjs';
import { verifyOutput as verifyCatalogOutput } from './verify-output.mjs';
import { makeBadge } from './badges.mjs';

const fixtureRoot = fileURLToPath(new URL('./fixtures/', import.meta.url));
const actualRaw = await readFile(resolve(fixtureRoot, 'info.v2.raw'), 'utf8');
const actualSource = await readFile(resolve(fixtureRoot, 'oci-mirror-proxy.rb'), 'utf8');
const actual = JSON.parse(actualRaw);
const tap = 'zmide/tap';
const fixedDate = '2026-05-04T03:02:01.000Z';
const homebrewVersion = 'Homebrew 5.0.0';
const homebrewPlatform = { os: process.platform, arch: process.arch, release: release() };
const verifyOutput = (options) => verifyCatalogOutput({ env: {}, ...options });
const baseConfig = {
	brand: { name: 'Test tap', title: 'Software', description: 'A tap' },
	tap,
	repository: 'https://github.com/zmide/homebrew-tap',
	site: { origin: 'https://zmide.github.io', basePath: '/homebrew-tap/' },
	i18n: { defaultLocale: 'en', locales: ['en', 'zh-CN'] },
	recentLimit: 8,
	links: { 'formula:zmide/tap/oci-mirror-proxy': { repository: 'https://github.com/runui/oci-mirror-proxy' } },
};

async function temporary(t) {
	const approved = process.env.OPENCODE_TMPDIR || resolve(tmpdir(), 'opencode');
	await mkdir(approved, { recursive: true });
	const root = await mkdtemp(resolve(approved, 'catalog-test-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	return root;
}

async function put(root, path, bytes) {
	await mkdir(dirname(resolve(root, path)), { recursive: true });
	await writeFile(resolve(root, path), bytes);
}

async function prepare(t, snapshot = actual, source = actualSource, config = baseConfig) {
	const root = await temporary(t);
	await put(root, 'tap.config.json', JSON.stringify(config));
	await put(root, 'Formula/oci-mirror-proxy.rb', source);
	await put(root, 'snapshot.json', JSON.stringify(snapshot));
	return root;
}

async function git(root, args, env = {}) {
	return run('git', args, { cwd: root, env: { ...process.env, ...env } });
}

async function initGit(root) {
	await git(root, ['init', '-q']);
	await git(root, ['config', 'user.email', 'catalog@example.test']);
	await git(root, ['config', 'user.name', 'Catalog Test']);
}

async function commit(root, message, date = fixedDate) {
	await git(root, ['add', '.']);
	await git(root, ['commit', '-qm', message], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
}

const offlineGit = async () => '';
const buildOffline = (root, extra = {}) => buildCatalog({ tapRoot: root, input: resolve(root, 'snapshot.json'), execute: offlineGit, now: () => new Date(fixedDate), ...extra });

function synthetic(kind, name, sourcePath, source = '# test-only source\n') {
	const common = {
		tap,
		desc: 'Test only',
		ruby_source_path: sourcePath,
		ruby_source_checksum: { sha256: sha256(source) },
		variations: {},
		future_key: { array: [null, false, { more: 'untouched' }] },
	};
	return kind === 'formula'
		? { ...common, name, full_name: `${tap}/${name}`, versions: { stable: '2.0', head: null }, aliases: ['tool-alias'] }
		: { ...common, token: name, full_token: `${tap}/${name}`, name: ['Test Display'], version: '2.0,5', artifacts: [['Test.app', { target: 'Renamed.app' }]] };
}

test('config validation preserves unknown keys and accepts root/custom base paths', () => {
	const config = { ...structuredClone(baseConfig), future: { nested: true } };
	assert.equal(validateConfig(config), config);
	assert.equal(validateBasePath('/'), '/');
	assert.equal(validateBasePath('/tools/homebrew-tap/'), '/tools/homebrew-tap/');
	for (const path of ['', 'tap/', '/tap', '//host/', '/../', '/foo/../', '/foo%2fbar/', '/x?y/', '/a.b/', '/中文/']) assert.throws(() => validateBasePath(path));
});

test('package links and platform support are optional supplemental configuration', async (t) => {
	const config = structuredClone(baseConfig);
	delete config.links;
	assert.equal(validateConfig(config), config);
	const root = await prepare(t, actual, actualSource, config);
	await buildOffline(root);
	const enhancements = JSON.parse(await readFile(resolve(root, 'web/.generated/enhancements.json'), 'utf8'));
	assert.deepEqual(enhancements, {});
	const published = JSON.parse(await readFile(resolve(root, 'web/.generated/public/api/formula/oci-mirror-proxy.json'), 'utf8'));
	assert.deepEqual(published, actual.formulae[0]);
});

test('config rejects unsafe, mistyped, or incomplete values', () => {
	const cases = [
		{ tap: '../tap' },
		{ tap: 'tap' },
		{ tap: 'owner/tap/extra' },
		{ repository: 'javascript:alert(1)' },
		{ repository: 'https://user:pass@example.com' },
		{ brand: { title: 'Missing name' } },
		{ site: { origin: 'https://example.com/path', basePath: '/' } },
		{ site: { origin: 'https://example.com?x=1', basePath: '/' } },
		{ i18n: { defaultLocale: 'fr', locales: ['en'] } },
		{ i18n: { defaultLocale: 'en', locales: ['en', 'en'] } },
		{ recentLimit: '8' },
		{ recentLimit: 0 },
		{ links: { 'formula:another/tap/name': {} } },
		{ links: { 'bad:zmide/tap/name': {} } },
		{ links: { 'cask:zmide/tap/name': { homepage: 'file:///etc/passwd' } } },
	];
	for (const change of cases) assert.throws(() => validateConfig({ ...structuredClone(baseConfig), ...change }), JSON.stringify(change));
});

test('real captured Homebrew v2 export is validated by reference without losing unknown fields', () => {
	const snapshot = structuredClone(actual);
	snapshot.future_envelope = { keys: [1, 'x', null] };
	snapshot.formulae[0].future_data = { values: [{ unknown: true }] };
	snapshot.formulae[0].variations.arm64_linux.new_key = [null, { nested: 'value' }];
	const before = structuredClone(snapshot);
	assert.equal(validateNative(snapshot, { tap }), snapshot);
	assert.deepEqual(snapshot, before);
	assert.equal(sha256(actualSource), snapshot.formulae[0].ruby_source_checksum.sha256);
	assert.deepEqual(snapshot.casks, []);
});

test('native validation allows same names across kinds and @ + . in safe names', () => {
	const name = 'tool@2+kit.1';
	const snapshot = { formulae: [synthetic('formula', name, `Formula/t/${name}.rb`)], casks: [synthetic('cask', name, `Casks/t/${name}.rb`)] };
	assert.equal(validateNative(snapshot, { tap }), snapshot);
	assert.equal(routePath('formula', name), 'formula/tool%402%2Bkit.1');
	assert.equal(routePath('cask', name), 'cask/tool%402%2Bkit.1');
	for (const name of ['../escape', '..', '.', '/tmp/name', 'x/y', 'x%2fy', 'a\\b', 'x?y', 'x#z', 'white space', '--eval-all', 'évil']) assert.throws(() => validateName(name));
});

test('native validation rejects missing identifiers, unsafe paths, duplicate identities, invalid checksums and variations', () => {
	const changes = [
		(entry) => delete entry.name,
		(entry) => delete entry.full_name,
		(entry) => {
			entry.full_name = 'another/tap/oci-mirror-proxy';
		},
		(entry) => {
			entry.full_name = `${tap}/other`;
		},
		(entry) => {
			entry.tap = 'another/tap';
		},
		(entry) => {
			entry.ruby_source_path = 'Formula/../../outside.rb';
		},
		(entry) => {
			entry.ruby_source_path = '/Formula/oci-mirror-proxy.rb';
		},
		(entry) => {
			entry.ruby_source_checksum.sha256 = 'not-a-hash';
		},
		(entry) => delete entry.variations,
		(entry) => {
			entry.aliases = ['../oops'];
		},
	];
	for (const change of changes) {
		const snapshot = structuredClone(actual);
		change(snapshot.formulae[0]);
		assert.throws(() => validateNative(snapshot, { tap }));
	}
	const duplicate = structuredClone(actual);
	duplicate.formulae.push(structuredClone(duplicate.formulae[0]));
	assert.throws(() => validateNative(duplicate, { tap }), /Duplicate/);
	assert.throws(() => validateNative({ formulae: [] }, { tap }), /casks/);
	for (const path of ['Casks/../evil.rb', 'Casks//evil.rb', 'Casks/a\\b.rb', 'Casks/evil.rb/other', 'Formula/evil.rb']) assert.throws(() => validateSourcePath(path, 'cask'));
});

test('source discovery is recursive for Formula/Casks/legacy Cask and rejects duplicates and symlinks', async (t) => {
	const root = await temporary(t);
	await put(root, 'Formula/t/tool@2+kit.1.rb', '# formula');
	await put(root, 'Casks/t/tool@2+kit.1.rb', '# cask');
	await put(root, 'Cask/legacy.rb', '# legacy');
	await put(root, 'Formula/README.md', 'Ignored');
	const sources = await discoverSources(root);
	assert.equal(sources.length, 3);
	assert.equal(sources[0].sha256, sha256('# formula'));
	assert.equal(sources[0].path, 'Formula/t/tool@2+kit.1.rb');
	await put(root, 'Formula/tool@2+kit.1.rb', '# duplicate');
	await assert.rejects(discoverSources(root), /Duplicate source name/);
	await rm(resolve(root, 'Formula/tool@2+kit.1.rb'));
	await symlink(resolve(root, 'Casks/t'), resolve(root, 'Formula/linked'));
	await assert.rejects(discoverSources(root), /Symlinks/);
});

test('source discovery rejects unsafe parent directories and symlinked source roots before brew', async (t) => {
	const root = await temporary(t);
	await put(root, 'Formula/unsafe dir/tool.rb', '# test');
	await assert.rejects(discoverSources(root), /Unsafe formula ruby_source_path/);
	const linked = await temporary(t);
	await symlink(resolve(root, 'Formula'), resolve(linked, 'Formula'));
	await assert.rejects(discoverSources(linked), /Symlinks/);
});

test('source validation rejects stale bytes, missing source and native source-path lies', async (t) => {
	const root = await prepare(t);
	const sources = await discoverSources(root);
	await assertSnapshotSources(actual, sources, root);
	const wrongPath = structuredClone(actual);
	wrongPath.formulae[0].ruby_source_path = 'Formula/nested/oci-mirror-proxy.rb';
	await assert.rejects(assertSnapshotSources(wrongPath, sources, root), /identity mismatch/);
	await assert.rejects(assertSnapshotSources(actual, [], root), /count mismatch/);
	await put(root, 'Formula/oci-mirror-proxy.rb', `${actualSource}\n# changed`);
	await assert.rejects(assertSnapshotSources(actual, sources, root), /changed while exporting/);
	await assert.rejects(assertSnapshotSources(actual, await discoverSources(root), root), /SHA256 mismatch/);
});

test('brew environment removes API-disabling flag and suppresses update/analytics', () => {
	const input = { PATH: '/test', HOMEBREW_NO_INSTALL_FROM_API: '1', HOMEBREW_NO_AUTO_UPDATE: '0' };
	const env = brewEnvironment(input);
	assert.equal(env.HOMEBREW_NO_INSTALL_FROM_API, undefined);
	assert.equal(env.HOMEBREW_NO_AUTO_UPDATE, '1');
	assert.equal(env.HOMEBREW_NO_ANALYTICS, '1');
	assert.equal(env.HOMEBREW_NO_BOOTSNAP, '1');
	assert.equal(input.HOMEBREW_NO_INSTALL_FROM_API, '1');
});

test('export is scoped to explicit tap/kind and preserves actual raw response bytes', async (t) => {
	const root = await prepare(t);
	const registered = await temporary(t);
	await put(registered, 'Formula/oci-mirror-proxy.rb', actualSource);
	const calls = [];
	const execute = async (command, args, options) => {
		calls.push({ command, args, options });
		if (args[0] === '--version') return `${homebrewVersion}\nExtra version details\n`;
		return args[0] === '--repo' ? registered : actualRaw;
	};
	const result = await exportCatalog({ tapRoot: root, execute, env: { HOMEBREW_NO_INSTALL_FROM_API: '1' } });
	assert.equal(await readFile(result.output, 'utf8'), actualRaw);
	assert.equal(await readFile(resolve(root, 'web/.generated/info.v2.formula.raw.json'), 'utf8'), actualRaw);
	assert.deepEqual(
		calls.filter((call) => call.command === 'brew').map((call) => call.args),
		[['--repo', tap], ['info', '--json=v2', '--variations', '--formula', `${tap}/oci-mirror-proxy`], ['--version']],
	);
	assert.ok(calls.filter((call) => call.command === 'brew').every((call) => !call.args.includes('--eval-all') && !call.options.env.HOMEBREW_NO_INSTALL_FROM_API));
	assert.equal(result.casks, 0);
	const provenance = JSON.parse(await readFile(provenancePath(result.output), 'utf8'));
	assert.deepEqual(provenance.homebrew, { version: homebrewVersion, platform: homebrewPlatform });
	assert.equal(provenance.inputSha256, sha256(actualRaw));
});

test('export refuses stale or missing registered taps without modifying either checkout or invoking info', async (t) => {
	const root = await prepare(t);
	const registered = await temporary(t);
	await put(registered, 'Formula/oci-mirror-proxy.rb', '# stale');
	const calls = [];
	await assert.rejects(
		exportCatalog({
			tapRoot: root,
			execute: async (_command, args) => {
				calls.push(args);
				return registered;
			},
		}),
		/stale/,
	);
	assert.equal(calls.length, 1);
	assert.equal(await readFile(resolve(registered, 'Formula/oci-mirror-proxy.rb'), 'utf8'), '# stale');
	await assert.rejects(
		exportCatalog({
			tapRoot: root,
			execute: async () => {
				throw new Error('not installed');
			},
		}),
		/not registered/,
	);
});

test('export explicitly disambiguates same-name formula/cask and preserves native unknown keys', async (t) => {
	const root = await temporary(t);
	const name = 'same@2+name.1';
	const formula = synthetic('formula', name, `Formula/${name}.rb`);
	const cask = synthetic('cask', name, `Casks/${name}.rb`);
	await put(root, 'tap.config.json', JSON.stringify(baseConfig));
	await put(root, formula.ruby_source_path, '# test-only source\n');
	await put(root, cask.ruby_source_path, '# test-only source\n');
	const formulaRaw = JSON.stringify({ formulae: [formula], casks: [], new_envelope: [1, 2] });
	const caskRaw = JSON.stringify({ formulae: [], casks: [cask], new_envelope: [1, 2] });
	const calls = [];
	const execute = async (_command, args) => {
		calls.push(args);
		if (args[0] === '--version') return homebrewVersion;
		return args[0] === '--repo' ? root : args.includes('--formula') ? formulaRaw : caskRaw;
	};
	const result = await exportCatalog({ tapRoot: root, execute });
	assert.deepEqual(JSON.parse(await readFile(result.output, 'utf8')), { formulae: [formula], casks: [cask], new_envelope: [1, 2] });
	assert.equal(await readFile(resolve(root, 'web/.generated/info.v2.cask.raw.json'), 'utf8'), caskRaw);
	assert.ok(calls[1].includes('--formula'));
	assert.ok(calls[2].includes('--cask'));
});

test('export rejects source checksum lies and wrong native kinds before writing', async (t) => {
	const root = await prepare(t);
	const snapshot = structuredClone(actual);
	snapshot.formulae[0].ruby_source_checksum.sha256 = '0'.repeat(64);
	await assert.rejects(exportCatalog({ tapRoot: root, execute: async (_command, args) => (args[0] === '--repo' ? root : JSON.stringify(snapshot)) }), /SHA256 mismatch/);
	await assert.rejects(stat(resolve(root, 'web/.generated/info.v2.json')), { code: 'ENOENT' });
	const wrong = { formulae: [], casks: [synthetic('cask', 'wrong', 'Casks/wrong.rb')] };
	await assert.rejects(exportCatalog({ tapRoot: root, execute: async (_command, args) => (args[0] === '--repo' ? root : JSON.stringify(wrong)) }), /Unexpected kind/);
});

test('cask-only exports skip formula evaluation and empty taps never evaluate global packages', async (t) => {
	const root = await temporary(t);
	const cask = synthetic('cask', 'test-only', 'Casks/t/test-only.rb');
	await put(root, 'tap.config.json', JSON.stringify(baseConfig));
	await put(root, cask.ruby_source_path, '# test-only source\n');
	const raw = JSON.stringify({ formulae: [], casks: [cask] });
	const calls = [];
	const execute = async (_command, args) => {
		calls.push(args);
		if (args[0] === '--version') return homebrewVersion;
		return args[0] === '--repo' ? root : raw;
	};
	const result = await exportCatalog({ tapRoot: root, execute });
	assert.equal(result.formulae, 0);
	assert.equal(result.casks, 1);
	assert.deepEqual(calls[1], ['info', '--json=v2', '--variations', '--cask', `${tap}/test-only`]);
	await rm(resolve(root, cask.ruby_source_path));
	calls.length = 0;
	const empty = await exportCatalog({ tapRoot: root, execute });
	assert.equal(empty.formulae, 0);
	assert.equal(empty.casks, 0);
	assert.deepEqual(JSON.parse(await readFile(empty.output, 'utf8')), { formulae: [], casks: [] });
	assert.equal(calls.filter((args) => ['info', '--repo', '--version'].includes(args[0])).length, 0);
});

test('empty tap templates export, build, cache and verify without Homebrew or a registered tap', async (t) => {
	const root = await temporary(t);
	await put(root, 'tap.config.json', JSON.stringify(baseConfig));
	await initGit(root);
	await commit(root, 'Empty tap template');
	const execute = async (command, args, options) => {
		assert.notEqual(command, 'brew', 'Empty templates must not require or evaluate Homebrew');
		return run(command, args, options);
	};
	const first = await buildCatalog({ tapRoot: root, execute });
	const inputPath = resolve(root, 'web/.generated/info.v2.json');
	assert.deepEqual(first.snapshot, { formulae: [], casks: [] });
	assert.deepEqual(first.manifest.sources, []);
	assert.deepEqual(first.manifest.routes, []);
	assert.deepEqual(first.manifest.counts, { formula: 0, cask: 0 });
	assert.deepEqual(first.manifest.homebrew, { version: null, platform: homebrewPlatform });
	assert.deepEqual(first.searchIndex, []);
	assert.deepEqual(first.enhancements, {});
	for (const kind of ['formula', 'cask']) assert.deepEqual(JSON.parse(await readFile(resolve(root, `web/.generated/public/api/${kind}.json`))), []);
	assert.equal(await reusableSnapshot({ inputPath, tapRoot: root, config: baseConfig, execute }), true);
	const original = await readFile(inputPath, 'utf8');
	await buildCatalog({ tapRoot: root, execute });
	assert.equal(await readFile(inputPath, 'utf8'), original);
	await prepareOutput(root, first.manifest);
	assert.deepEqual(await verifyOutput({ tapRoot: root }), { formulae: 0, casks: 0, basePath: '/homebrew-tap/' });
});

test('search versions include positive formula revisions without changing native formula/cask JSON', () => {
	for (const revision of [undefined, 0, 1, 12]) {
		const formula = structuredClone(actual.formulae[0]);
		if (revision === undefined) delete formula.revision;
		else formula.revision = revision;
		const original = structuredClone(formula);
		assert.equal(makeSearchEntry('formula', formula).version, `1.0.19${revision > 0 ? `_${revision}` : ''}`);
		assert.deepEqual(formula, original);
	}
	const headOnly = { ...structuredClone(actual.formulae[0]), versions: { stable: null, head: 'HEAD' }, revision: 2 };
	assert.equal(makeSearchEntry('formula', headOnly).version, 'HEAD');
	const cask = { ...synthetic('cask', 'test-only', 'Casks/test-only.rb'), revision: 3 };
	const original = structuredClone(cask);
	assert.equal(makeSearchEntry('cask', cask).version, '2.0,5');
	assert.deepEqual(cask, original);
});

test('badge and search versions agree without mutating native records', () => {
	const formula = synthetic('formula', 'tool', 'Formula/tool.rb');
	const cask = synthetic('cask', 'tool', 'Casks/tool.rb');
	for (const [kind, item, message] of [
		['formula', { ...formula, pkg_version: '3.0_7', revision: 2 }, '3.0_7'],
		['formula', { ...formula, revision: 2 }, '2.0_2'],
		...[-1, 0, 1.5, '2', null].map((revision) => ['formula', { ...formula, revision }, '2.0']),
		['formula', { ...formula, versions: { stable: null, head: 'HEAD' }, revision: 2 }, 'HEAD'],
		['formula', { ...formula, versions: { stable: null, head: null } }, 'unknown'],
		['formula', { ...formula, versions: { stable: ' ' }, pkg_version: '' }, 'unknown'],
		['cask', { ...cask, revision: 4 }, '2.0,5'],
		['cask', { ...cask, version: 'latest' }, 'latest'],
		['cask', { ...cask, version: '' }, 'unknown'],
	]) {
		const before = structuredClone(item);
		Object.freeze(item);
		assert.deepEqual(makeBadge(kind, item), {
			schemaVersion: 1,
			label: 'Homebrew',
			message,
			color: message === 'unknown' ? 'lightgrey' : 'orange',
			namedLogo: 'homebrew',
		});
		assert.equal(makeSearchEntry(kind, item).version || 'unknown', message);
		assert.deepEqual(item, before);
	}
});

test('Git commit timestamp follows renames and ignores mtime; no history is omitted', async (t) => {
	const root = await prepare(t);
	await initGit(root);
	assert.equal(await sourceUpdatedAt(root, 'Formula/oci-mirror-proxy.rb'), undefined);
	await commit(root, 'Initial source');
	await utimes(resolve(root, 'Formula/oci-mirror-proxy.rb'), new Date(), new Date('2031-01-01T00:00:00Z'));
	assert.equal(await sourceUpdatedAt(root, 'Formula/oci-mirror-proxy.rb'), fixedDate);
	await rename(resolve(root, 'Formula/oci-mirror-proxy.rb'), resolve(root, 'Formula/new-name.rb'));
	const renamedDate = '2026-06-07T08:09:10.000Z';
	await commit(root, 'Rename source', renamedDate);
	assert.equal(await sourceUpdatedAt(root, 'Formula/new-name.rb'), renamedDate);
	await put(root, 'Formula/untracked.rb', '# untracked');
	assert.equal(await sourceUpdatedAt(root, 'Formula/untracked.rb'), undefined);
	const historyArgs = [];
	await sourceUpdatedAt(root, 'Formula/new-name.rb', async (_command, args) => {
		historyArgs.push(args);
		return args[0] === 'ls-files' ? 'Formula/new-name.rb' : renamedDate;
	});
	assert.deepEqual(historyArgs[1], ['log', '-1', '--follow', '--format=%cI', '--', 'Formula/new-name.rb']);
});

test('offline build preserves official arrays and endpoints, keeps enhancements separate, writes provenance and cleans stale endpoints', async (t) => {
	const snapshot = structuredClone(actual);
	snapshot.formulae[0].unknown = { future: [null, { yes: true }] };
	snapshot.new_envelope = { untouched: true };
	const root = await prepare(t, snapshot);
	await initGit(root);
	await commit(root, 'Initial formula');
	await put(root, 'web/.generated/public/api/formula/stale.json', '{}');
	await put(root, 'web/.generated/public/badges/formula/stale.json', '{}');
	await put(root, 'web/.generated/public/badges/cask/stale.json', '{}');
	const result = await buildOffline(root, { execute: run });
	const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
	assert.deepEqual(await readJson('web/.generated/public/api/formula.json'), snapshot.formulae);
	assert.deepEqual(await readJson('web/.generated/public/api/cask.json'), []);
	assert.deepEqual(await readJson('web/.generated/public/api/formula/oci-mirror-proxy.json'), snapshot.formulae[0]);
	assert.deepEqual(await readJson('web/.generated/info.v2.json'), snapshot);
	assert.deepEqual(await readJson('web/.generated/public/badges/formula/oci-mirror-proxy.json'), makeBadge('formula', snapshot.formulae[0]));
	assert.equal(result.searchIndex[0].updatedAt, fixedDate);
	assert.deepEqual(result.enhancements[`formula:${tap}/oci-mirror-proxy`], { updatedAt: fixedDate, links: baseConfig.links[`formula:${tap}/oci-mirror-proxy`] });
	assert.ok(!Object.hasOwn(result.snapshot.formulae[0], 'updatedAt'));
	assert.equal(result.manifest.input.sha256, sha256(await readFile(resolve(root, 'snapshot.json'))));
	assert.equal(result.manifest.sources[0].sha256, sha256(actualSource));
	assert.equal(result.manifest.generatedAt, fixedDate);
	assert.equal(result.manifest.git.head.length, 40);
	await assert.rejects(stat(resolve(root, 'web/.generated/public/api/formula/stale.json')), { code: 'ENOENT' });
	for (const kind of ['formula', 'cask']) await assert.rejects(stat(resolve(root, `web/.generated/public/badges/${kind}/stale.json`)), { code: 'ENOENT' });
});

test('offline build distinguishes same-name kinds, cask native names, encoded routes, nullable dates, and unknown fields', async (t) => {
	const root = await temporary(t);
	const name = 'same@2+name.1';
	const formula = synthetic('formula', name, `Formula/${name}.rb`);
	const cask = synthetic('cask', name, `Casks/${name}.rb`);
	await put(root, 'tap.config.json', JSON.stringify(baseConfig));
	await put(root, formula.ruby_source_path, '# test-only source\n');
	await put(root, cask.ruby_source_path, '# test-only source\n');
	await put(root, 'snapshot.json', JSON.stringify({ formulae: [formula], casks: [cask] }));
	const result = await buildOffline(root);
	assert.deepEqual(result.searchIndex, [
		{ kind: 'formula', name, fullName: `${tap}/${name}`, displayName: name, desc: 'Test only', version: '2.0', aliases: ['tool-alias'], updatedAt: null },
		{ kind: 'cask', name, fullName: `${tap}/${name}`, displayName: 'Test Display', desc: 'Test only', version: '2.0,5', aliases: [], updatedAt: null },
	]);
	assert.deepEqual(result.enhancements, {});
	assert.equal(result.manifest.routes[0].path, 'formula/same%402%2Bname.1');
	assert.deepEqual(JSON.parse(await readFile(resolve(root, `web/.generated/public/api/cask/${name}.json`))), cask);
	assert.equal(JSON.parse(await readFile(resolve(root, `web/.generated/public/badges/formula/${name}.json`))).message, '2.0');
	assert.equal(JSON.parse(await readFile(resolve(root, `web/.generated/public/badges/cask/${name}.json`))).message, '2.0,5');
	await prepareOutput(root, result.manifest);
	await verifyOutput({ tapRoot: root });
});

test('custom output paths update badge versions and remove deleted package badges', async (t) => {
	const root = await prepare(t);
	const generatedDir = resolve(root, 'derived');
	const publicDir = resolve(root, 'assets');
	const badgePath = resolve(publicDir, 'badges/formula/oci-mirror-proxy.json');
	await buildOffline(root, { generatedDir, publicDir });
	assert.equal(JSON.parse(await readFile(badgePath)).message, '1.0.19');
	const snapshot = structuredClone(actual);
	snapshot.formulae[0].pkg_version = '1.0.19_9';
	await put(root, 'snapshot.json', JSON.stringify(snapshot));
	const updated = await buildOffline(root, { generatedDir, publicDir });
	assert.equal(JSON.parse(await readFile(badgePath)).message, '1.0.19_9');
	assert.deepEqual(JSON.parse(await readFile(resolve(publicDir, 'api/formula/oci-mirror-proxy.json'))), snapshot.formulae[0]);
	const outputDir = resolve(root, 'published');
	await cp(publicDir, outputDir, { recursive: true });
	for (const prefix of ['', 'zh-CN/']) {
		for (const path of [prefix, `${prefix}formula/`, `${prefix}cask/`, ...updated.manifest.routes.map((route) => `${prefix}${route.path}/`)]) {
			await put(root, `published/${path}index.html`, '<!doctype html><title>Tap</title>');
		}
	}
	assert.deepEqual(await verifyOutput({ tapRoot: root, generatedDir, outputDir }), { formulae: 1, casks: 0, basePath: '/homebrew-tap/' });
	await rm(resolve(root, 'Formula/oci-mirror-proxy.rb'));
	await put(root, 'snapshot.json', JSON.stringify({ formulae: [], casks: [] }));
	await buildOffline(root, { generatedDir, publicDir });
	await assert.rejects(stat(badgePath), { code: 'ENOENT' });
});

async function prepareOutput(root, manifest) {
	await cp(resolve(root, 'web/.generated/public'), resolve(root, 'web/.output/public'), { recursive: true });
	for (const prefix of ['', 'zh-CN/']) {
		for (const path of [prefix, `${prefix}formula/`, `${prefix}cask/`]) await put(root, `web/.output/public/${path}index.html`, '<!doctype html><title>Tap</title>');
		for (const route of manifest.routes) await put(root, `web/.output/public/${prefix}${route.path}/index.html`, '<!doctype html><title>Package</title>');
	}
}

test('verification checks root layout, subpath deployment, route presence, all API equivalence, stale files and manifest', async (t) => {
	const root = await prepare(t);
	const result = await buildOffline(root);
	await prepareOutput(root, result.manifest);
	assert.deepEqual(await verifyOutput({ tapRoot: root }), { formulae: 1, casks: 0, basePath: '/homebrew-tap/' });
	const badgePath = 'web/.output/public/badges/formula/oci-mirror-proxy.json';
	await rm(resolve(root, badgePath));
	await assert.rejects(verifyOutput({ tapRoot: root }), /Missing badge endpoint/);
	await put(root, badgePath, JSON.stringify({ ...makeBadge('formula', result.snapshot.formulae[0]), message: 'outdated' }));
	await assert.rejects(verifyOutput({ tapRoot: root }), /badge differs from native package/);
	await copyFile(resolve(root, 'web/.generated/public/badges/formula/oci-mirror-proxy.json'), resolve(root, badgePath));
	await put(root, 'web/.output/public/badges/formula/old.json', '{}');
	await assert.rejects(verifyOutput({ tapRoot: root }), /stale formula badge/);
	await rm(resolve(root, 'web/.output/public/badges/formula/old.json'));
	await put(root, 'web/.output/public/badges/cask/old.json', '{}');
	await assert.rejects(verifyOutput({ tapRoot: root }), /stale cask badge/);
	await rm(resolve(root, 'web/.output/public/badges/cask/old.json'));
	const apiPath = 'web/.output/public/api/formula/oci-mirror-proxy.json';
	await put(root, apiPath, '{}');
	await assert.rejects(verifyOutput({ tapRoot: root }), /differs from official JSON/);
	await copyFile(resolve(root, 'web/.generated/public/api/formula/oci-mirror-proxy.json'), resolve(root, apiPath));
	await put(root, 'web/.output/public/api/cask.json', '[{}]');
	await assert.rejects(verifyOutput({ tapRoot: root }), /api\/cask.json differs/);
	await put(root, 'web/.output/public/api/cask.json', '[]');
	await put(root, 'web/.output/public/api/formula/old.json', '{}');
	await assert.rejects(verifyOutput({ tapRoot: root }), /stale/);
	await rm(resolve(root, 'web/.output/public/api/formula/old.json'));
	await rm(resolve(root, 'web/.output/public/formula/oci-mirror-proxy/index.html'));
	await assert.rejects(verifyOutput({ tapRoot: root }), /Missing prerendered route/);
	await put(root, 'web/.output/public/formula/oci-mirror-proxy/index.html', '<html></html>');
	await rm(resolve(root, 'web/.output/public/zh-CN/formula/oci-mirror-proxy/index.html'));
	await assert.rejects(verifyOutput({ tapRoot: root }), /zh-CN\/formula/);
	await put(root, 'web/.output/public/zh-CN/formula/oci-mirror-proxy/index.html', '<html></html>');
	await rm(resolve(root, 'web/.output/public/cask/index.html'));
	await assert.rejects(verifyOutput({ tapRoot: root }), /collection\/index route/);
	await put(root, 'web/.output/public/cask/index.html', '<html></html>');
	const badManifest = structuredClone(result.manifest);
	badManifest.input.sha256 = '0'.repeat(64);
	await put(root, 'web/.generated/manifest.json', JSON.stringify(badManifest));
	await assert.rejects(verifyOutput({ tapRoot: root }), /SHA256/);
	await put(root, 'web/.generated/manifest.json', JSON.stringify(result.manifest));
	const badSource = structuredClone(result.manifest);
	badSource.sources[0].sha256 = '0'.repeat(64);
	await put(root, 'web/.generated/manifest.json', JSON.stringify(badSource));
	await assert.rejects(verifyOutput({ tapRoot: root }), /source provenance/);
	await put(root, 'web/.generated/manifest.json', JSON.stringify(result.manifest));
	await rm(resolve(root, 'web/.output/public/index.html'));
	await assert.rejects(verifyOutput({ tapRoot: root }), /Static root index/);
});

test('verification supports root base paths and decoded static names with special characters', async (t) => {
	const root = await temporary(t);
	const name = 'tool@2+kit.1';
	const config = { ...structuredClone(baseConfig), site: { origin: 'https://example.com', basePath: '/' } };
	const formula = synthetic('formula', name, `Formula/${name}.rb`);
	await put(root, 'tap.config.json', JSON.stringify(config));
	await put(root, formula.ruby_source_path, '# test-only source\n');
	await put(root, 'snapshot.json', JSON.stringify({ formulae: [formula], casks: [] }));
	const result = await buildOffline(root);
	await prepareOutput(root, result.manifest);
	for (const prefix of ['', 'zh-CN/']) {
		await rename(resolve(root, `web/.output/public/${prefix}formula/${encodeURIComponent(name)}`), resolve(root, `web/.output/public/${prefix}formula/${name}`));
	}
	assert.deepEqual(await verifyOutput({ tapRoot: root }), { formulae: 1, casks: 0, basePath: '/' });
});

test('verification honors safe NUXT_APP_BASE_URL overrides without changing manifest source configuration', async (t) => {
	const root = await prepare(t);
	const result = await buildOffline(root);
	await prepareOutput(root, result.manifest);
	for (const basePath of ['/', '/second/deployment/']) {
		assert.deepEqual(await verifyOutput({ tapRoot: root, env: { NUXT_APP_BASE_URL: basePath } }), { formulae: 1, casks: 0, basePath });
	}
	assert.equal(JSON.parse(await readFile(resolve(root, 'web/.generated/manifest.json'))).site.basePath, '/homebrew-tap/');
	for (const basePath of ['', '//other-host/', '/../', '/unsafe%2fpath/', 'https://other-host/', '/missing-trailing-slash']) {
		await assert.rejects(verifyOutput({ tapRoot: root, env: { NUXT_APP_BASE_URL: basePath } }), /site.basePath must be/);
	}
	await rm(resolve(root, 'web/.output/public/formula/oci-mirror-proxy/index.html'));
	await assert.rejects(verifyOutput({ tapRoot: root, env: { NUXT_APP_BASE_URL: '/' } }), /route: \/formula\/oci-mirror-proxy\//);
	const changedManifest = structuredClone(result.manifest);
	changedManifest.site.basePath = '/';
	await put(root, 'web/.generated/manifest.json', JSON.stringify(changedManifest));
	await assert.rejects(verifyOutput({ tapRoot: root, env: { NUXT_APP_BASE_URL: '/' } }), /Manifest configuration mismatch/);
});

test('offline manifests preserve matching export Homebrew provenance and never misattribute missing or mismatched metadata', async (t) => {
	const snapshot = structuredClone(actual);
	snapshot.formulae[0].revision = 4;
	const root = await prepare(t, snapshot);
	const inputPath = resolve(root, 'snapshot.json');
	const raw = await readFile(inputPath);
	const exportedHost = { version: homebrewVersion, platform: { os: 'linux', arch: 'x64', release: 'export-host-release' } };
	const provenance = {
		schemaVersion: 1,
		tap,
		gitHead: null,
		inputSha256: sha256(raw),
		sources: await discoverSources(root),
		homebrew: exportedHost,
	};
	await put(root, 'snapshot.provenance.json', JSON.stringify(provenance));
	const result = await buildOffline(root);
	assert.deepEqual(result.manifest.homebrew, exportedHost);
	assert.equal(result.searchIndex[0].version, '1.0.19_4');
	assert.equal(await readFile(resolve(root, 'web/.generated/info.v2.json'), 'utf8'), raw.toString());
	assert.deepEqual(JSON.parse(await readFile(resolve(root, 'web/.generated/public/api/formula/oci-mirror-proxy.json'))), snapshot.formulae[0]);
	for (const change of [{ inputSha256: '0'.repeat(64) }, { tap: 'another/tap' }, { sources: [] }, { homebrew: undefined }]) {
		await put(root, 'snapshot.provenance.json', JSON.stringify({ ...provenance, ...change }));
		assert.deepEqual((await buildOffline(root)).manifest.homebrew, { version: null, platform: null });
	}
	await rm(provenancePath(inputPath));
	assert.deepEqual((await buildOffline(root)).manifest.homebrew, { version: null, platform: null });
});

test('build --input rejects source checksum/count mismatches before writing output', async (t) => {
	const root = await prepare(t, actual, `${actualSource}\n# candidate change`);
	await assert.rejects(buildOffline(root), /SHA256 mismatch/);
	await assert.rejects(stat(resolve(root, 'web/.generated/public/api/formula.json')), { code: 'ENOENT' });
	await put(root, 'Formula/oci-mirror-proxy.rb', actualSource);
	await put(root, 'Casks/unexported.rb', '# new candidate cask');
	await assert.rejects(buildOffline(root), /cask count mismatch/);
});

test('default builds reuse only a provenance-verified source and HEAD match, otherwise export fresh', async (t) => {
	const root = await prepare(t);
	await initGit(root);
	await commit(root, 'Source');
	let infoCalls = 0;
	const execute = async (command, args, options) => {
		if (command === 'git') return run(command, args, options);
		if (args[0] === '--repo') return root;
		if (args[0] === '--version') return homebrewVersion;
		infoCalls++;
		const snapshot = structuredClone(actual);
		snapshot.formulae[0].ruby_source_checksum.sha256 = sha256(await readFile(resolve(root, 'Formula/oci-mirror-proxy.rb')));
		return JSON.stringify(snapshot);
	};
	await buildCatalog({ tapRoot: root, execute });
	assert.equal(infoCalls, 1);
	const inputPath = resolve(root, 'web/.generated/info.v2.json');
	assert.equal(await reusableSnapshot({ inputPath, tapRoot: root, config: baseConfig, execute }), true);
	const second = await buildCatalog({ tapRoot: root, execute });
	assert.equal(infoCalls, 1, 'Second build must not invoke brew info');
	assert.deepEqual(second.manifest.homebrew, { version: homebrewVersion, platform: homebrewPlatform });
	const legacy = JSON.parse(await readFile(provenancePath(inputPath), 'utf8'));
	delete legacy.homebrew;
	await writeFile(provenancePath(inputPath), JSON.stringify(legacy));
	const legacyBuild = await buildCatalog({ tapRoot: root, execute });
	assert.equal(infoCalls, 1, 'Legacy provenance remains valid without forcing a new export');
	assert.deepEqual(legacyBuild.manifest.homebrew, { version: null, platform: null });
	await put(root, 'tap.config.json', JSON.stringify({ ...baseConfig, brand: { ...baseConfig.brand, title: 'Updated brand only' } }));
	await buildCatalog({ tapRoot: root, execute });
	assert.equal(infoCalls, 1, 'A brand-only config update must not invalidate native source data');
	await put(root, 'Formula/oci-mirror-proxy.rb', `${actualSource}\n# Candidate source change\n`);
	assert.equal(await reusableSnapshot({ inputPath, tapRoot: root, config: baseConfig, execute }), false);
	await buildCatalog({ tapRoot: root, execute });
	assert.equal(infoCalls, 2, 'Dirty source bytes invalidate reuse even with same HEAD');
	await commit(root, 'New HEAD', '2026-06-01T00:00:00.000Z');
	assert.equal(await reusableSnapshot({ inputPath, tapRoot: root, config: baseConfig, execute }), false);
	await buildCatalog({ tapRoot: root, execute });
	assert.equal(infoCalls, 3, 'New HEAD invalidates reuse even with same source bytes');
	await writeFile(inputPath, `${await readFile(inputPath, 'utf8')}\n`);
	await buildCatalog({ tapRoot: root, execute });
	assert.equal(infoCalls, 4, 'Tampered snapshot bytes invalidate provenance');
	await rm(provenancePath(inputPath));
	await buildCatalog({ tapRoot: root, execute });
	assert.equal(infoCalls, 5, 'Missing provenance never trusts cached JSON');
	assert.equal(await reusableSnapshot({ inputPath, tapRoot: root, config: baseConfig, execute: offlineGit }), false, 'No valid HEAD means no automatic cache reuse');
});
