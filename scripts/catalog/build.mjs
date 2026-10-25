import { readFile, mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { assert, readConfig } from './config.mjs';
import { main, options, writeJson } from './cli.mjs';
import { exportCatalog, provenancePath, checkoutHead } from './export.mjs';
import { arrayKeys, identity, kinds, nativeFullName, nativeName, routePath, validateNative } from './native.mjs';
import { assertSnapshotSources, discoverSources, run, sha256, sourceUpdatedAt } from './sources.mjs';
import { packageVersion } from '../../shared/homebrew-version.mjs';
import { makeBadge } from './badges.mjs';

export function makeSearchEntry(kind, entry, enhancement = {}) {
	return {
		kind,
		name: nativeName(kind, entry),
		fullName: nativeFullName(kind, entry),
		displayName: kind === 'cask' ? entry.name[0] || entry.token : entry.name,
		desc: entry.desc ?? '',
		version: packageVersion(kind, entry) ?? '',
		aliases: kind === 'formula' ? [...entry.aliases] : [],
		updatedAt: enhancement.updatedAt ?? null,
	};
}

async function cleanStaleEndpoints(directory, names) {
	await mkdir(directory, { recursive: true });
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		if (entry.isFile() && entry.name.endsWith('.json') && !names.has(entry.name)) await unlink(resolve(directory, entry.name));
	}
}

/** A cache hit requires both Git HEAD and every source byte to still match. */
export async function reusableSnapshot({ inputPath, tapRoot, config, execute = run }) {
	try {
		const raw = await readFile(inputPath);
		const provenance = JSON.parse(await readFile(provenancePath(inputPath), 'utf8'));
		const head = await checkoutHead(tapRoot, execute);
		if (!head || provenance.schemaVersion !== 1 || provenance.gitHead !== head || provenance.tap !== config.tap || provenance.inputSha256 !== sha256(raw)) return false;
		const sources = await discoverSources(tapRoot);
		if (!isDeepStrictEqual(provenance.sources, sources)) return false;
		await assertSnapshotSources(validateNative(JSON.parse(raw), config), sources, tapRoot);
		return true;
	} catch {
		return false;
	}
}

export async function buildCatalog({
	tapRoot,
	configPath = resolve(tapRoot, 'tap.config.json'),
	input,
	generatedDir = resolve(tapRoot, 'web/.generated'),
	publicDir = resolve(generatedDir, 'public'),
	execute = run,
	now = () => new Date(),
}) {
	const config = await readConfig(configPath);
	const inputPath = resolve(input ?? resolve(generatedDir, 'info.v2.json'));
	if (!input && !(await reusableSnapshot({ inputPath, tapRoot, config, execute }))) await exportCatalog({ tapRoot, configPath, output: inputPath, execute });
	const raw = await readFile(inputPath);
	const snapshot = validateNative(JSON.parse(raw), config);
	const sources = await discoverSources(tapRoot);
	await assertSnapshotSources(snapshot, sources, tapRoot);
	const provenance = await readFile(provenancePath(inputPath), 'utf8')
		.then(JSON.parse)
		.catch(() => null);
	const matchesProvenance =
		provenance?.schemaVersion === 1 && provenance.tap === config.tap && provenance.inputSha256 === sha256(raw) && isDeepStrictEqual(provenance.sources, sources);
	// Never substitute this build host for the host which evaluated the snapshot.
	// Legacy/explicit snapshots without metadata remain usable, with null values.
	const homebrew = matchesProvenance && provenance.homebrew ? provenance.homebrew : { version: null, platform: null };
	const enhancements = {};
	const searchIndex = [];
	const routes = [];
	const badges = new Map();
	for (const kind of kinds) {
		const entries = snapshot[arrayKeys[kind]];
		for (const entry of entries) {
			const id = identity(kind, entry);
			const updatedAt = await sourceUpdatedAt(tapRoot, entry.ruby_source_path, execute);
			const links = config.links?.[id];
			const enhancement = { ...(updatedAt ? { updatedAt } : {}), ...(links ? { links } : {}) };
			if (Object.keys(enhancement).length) enhancements[id] = enhancement;
			const name = nativeName(kind, entry);
			badges.set(id, makeBadge(kind, entry));
			searchIndex.push(makeSearchEntry(kind, entry, enhancement));
			routes.push({ kind, name, path: routePath(kind, name), apiPath: `api/${kind}/${encodeURIComponent(name)}.json` });
		}
	}
	const head = (await execute('git', ['rev-parse', 'HEAD'], { cwd: tapRoot }).catch(() => '')).trim() || null;
	const dirty = Boolean((await execute('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: tapRoot }).catch(() => '')).trim());
	const manifest = {
		schemaVersion: 1,
		generatedAt: now().toISOString(),
		tap: config.tap,
		repository: config.repository,
		site: config.site,
		input: { path: relative(tapRoot, inputPath).split('\\').join('/'), sha256: sha256(raw) },
		git: { head, dirty },
		homebrew,
		counts: { formula: snapshot.formulae.length, cask: snapshot.casks.length },
		sources,
		routes,
		api: { formula: 'api/formula.json', cask: 'api/cask.json' },
	};
	// All validation precedes writes. Official objects never receive enhancements.
	await mkdir(generatedDir, { recursive: true });
	if (resolve(inputPath) !== resolve(generatedDir, 'info.v2.json')) await writeFile(resolve(generatedDir, 'info.v2.json'), raw);
	for (const kind of kinds) {
		const entries = snapshot[arrayKeys[kind]];
		await writeJson(resolve(publicDir, `api/${kind}.json`), entries);
		await cleanStaleEndpoints(resolve(publicDir, `api/${kind}`), new Set(entries.map((entry) => `${nativeName(kind, entry)}.json`)));
		await cleanStaleEndpoints(resolve(publicDir, `badges/${kind}`), new Set(entries.map((entry) => `${nativeName(kind, entry)}.json`)));
		for (const entry of entries) {
			await writeJson(resolve(publicDir, `api/${kind}/${nativeName(kind, entry)}.json`), entry);
			await writeJson(resolve(publicDir, `badges/${kind}/${nativeName(kind, entry)}.json`), badges.get(identity(kind, entry)));
		}
	}
	await writeJson(resolve(generatedDir, 'enhancements.json'), enhancements);
	await writeJson(resolve(generatedDir, 'search-index.json'), searchIndex);
	await writeJson(resolve(generatedDir, 'manifest.json'), manifest);
	assert(searchIndex.length === sources.length, 'Search index count mismatch');
	return { snapshot, enhancements, searchIndex, manifest };
}

main(import.meta.url, async (args) => {
	const flags = options(args, { input: { type: 'string' }, 'generated-dir': { type: 'string' }, 'public-dir': { type: 'string' } });
	const result = await buildCatalog({
		tapRoot: resolve(flags['tap-root']),
		configPath: flags.config && resolve(flags.config),
		input: flags.input && resolve(flags.input),
		generatedDir: flags['generated-dir'] && resolve(flags['generated-dir']),
		publicDir: flags['public-dir'] && resolve(flags['public-dir']),
	});
	console.log(`Built ${result.manifest.counts.formula} formulae and ${result.manifest.counts.cask} casks from verified Homebrew v2 JSON`);
});
