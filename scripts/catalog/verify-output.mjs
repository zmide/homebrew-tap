import { readFile, stat, readdir } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { assert, readConfig, validateBasePath } from './config.mjs';
import { main, options } from './cli.mjs';
import { arrayKeys, kinds, nativeName, routePath, validateNative } from './native.mjs';
import { sha256 } from './sources.mjs';
import { makeBadge } from './badges.mjs';

const json = async (path) => JSON.parse(await readFile(path, 'utf8'));

function safePath(root, path) {
	const result = resolve(root, path);
	const rel = relative(root, result);
	assert(rel && !rel.startsWith(`..${sep}`) && !rel.startsWith(sep), `Output path escapes root: ${path}`);
	return result;
}

async function exists(path) {
	return stat(path)
		.then((result) => result.isFile())
		.catch(() => false);
}

/** Nitro output remains at the public root, not public/<basePath>. */
export async function verifyOutput({
	tapRoot,
	configPath = resolve(tapRoot, 'tap.config.json'),
	generatedDir = resolve(tapRoot, 'web/.generated'),
	outputDir = resolve(tapRoot, 'web/.output/public'),
	env = process.env,
}) {
	const config = await readConfig(configPath);
	const basePath = validateBasePath(env.NUXT_APP_BASE_URL ?? config.site.basePath);
	const snapshotBytes = await readFile(resolve(generatedDir, 'info.v2.json'));
	const snapshot = validateNative(JSON.parse(snapshotBytes), config);
	const manifest = await json(resolve(generatedDir, 'manifest.json'));
	assert(
		manifest.schemaVersion === 1 && manifest.tap === config.tap && manifest.repository === config.repository && isDeepStrictEqual(manifest.site, config.site),
		'Manifest configuration mismatch',
	);
	assert(manifest.input.sha256 === sha256(snapshotBytes), 'Manifest input SHA256 mismatch');
	assert(isDeepStrictEqual(manifest.api, { formula: 'api/formula.json', cask: 'api/cask.json' }), 'Manifest API paths mismatch');
	const expectedSources = kinds.flatMap((kind) =>
		snapshot[arrayKeys[kind]].map((entry) => ({ kind, name: nativeName(kind, entry), path: entry.ruby_source_path, sha256: entry.ruby_source_checksum.sha256 })),
	);
	assert(Array.isArray(manifest.sources) && manifest.sources.length === expectedSources.length, 'Manifest source count mismatch');
	for (const source of expectedSources)
		assert(
			manifest.sources.some((candidate) => isDeepStrictEqual(candidate, source)),
			`Manifest source provenance mismatch: ${source.path}`,
		);
	assert(await exists(resolve(outputDir, 'index.html')), 'Static root index.html is missing (expected web/.output/public)');
	for (const locale of config.i18n.locales) {
		const prefix = locale === config.i18n.defaultLocale ? '' : `${locale}/`;
		for (const path of [prefix, `${prefix}formula/`, `${prefix}cask/`]) {
			assert(await exists(safePath(outputDir, `${path}index.html`)), `Missing prerendered collection/index route: ${basePath}${path}`);
		}
	}
	const expectedRoutes = [];
	for (const kind of kinds) {
		const entries = snapshot[arrayKeys[kind]];
		assert(manifest.counts[kind] === entries.length, `Manifest ${kind} count mismatch`);
		const collection = await json(safePath(outputDir, `api/${kind}.json`));
		assert(isDeepStrictEqual(collection, entries), `Published api/${kind}.json differs from official JSON`);
		const expectedFiles = new Set();
		for (const entry of entries) {
			const name = nativeName(kind, entry);
			const route = routePath(kind, name);
			const apiPath = `api/${kind}/${encodeURIComponent(name)}.json`;
			expectedRoutes.push({ kind, name, path: route, apiPath });
			expectedFiles.add(`${name}.json`);
			const individual = await json(safePath(outputDir, `api/${kind}/${name}.json`));
			assert(isDeepStrictEqual(individual, entry), `Published ${apiPath} differs from official JSON`);
			const badgePath = `badges/${kind}/${name}.json`;
			assert(await exists(safePath(outputDir, badgePath)), `Missing badge endpoint: ${badgePath}`);
			assert(isDeepStrictEqual(await json(safePath(outputDir, badgePath)), makeBadge(kind, entry)), `Published badge differs from native package: ${badgePath}`);
			// Generators may emit URL-encoded or decoded directory names for @ and +.
			for (const locale of config.i18n.locales) {
				const prefix = locale === config.i18n.defaultLocale ? '' : `${locale}/`;
				const htmlPaths = [...new Set([`${prefix}${route}/index.html`, `${prefix}${kind}/${name}/index.html`, `${prefix}${route}.html`, `${prefix}${kind}/${name}.html`])];
				assert((await Promise.all(htmlPaths.map((path) => exists(safePath(outputDir, path))))).some(Boolean), `Missing prerendered route: ${basePath}${prefix}${route}/`);
			}
			const url = new URL(`${basePath}${route}/`, config.site.origin);
			assert(url.pathname.startsWith(basePath) && decodeURIComponent(url.pathname) === `${basePath}${kind}/${name}/`, `Unsafe route URL: ${route}`);
		}
		const files = await readdir(resolve(outputDir, `api/${kind}`)).catch((error) => {
			if (error.code === 'ENOENT' && entries.length === 0) return [];
			throw error;
		});
		assert(
			files.every((name) => expectedFiles.has(name)),
			`Unexpected stale ${kind} API endpoint`,
		);
		const badgeFiles = await readdir(resolve(outputDir, `badges/${kind}`)).catch((error) => {
			if (error.code === 'ENOENT' && entries.length === 0) return [];
			throw error;
		});
		assert(
			badgeFiles.every((name) => expectedFiles.has(name)),
			`Unexpected stale ${kind} badge endpoint`,
		);
	}
	assert(isDeepStrictEqual(manifest.routes, expectedRoutes), 'Manifest route identities differ from official JSON');
	return { formulae: snapshot.formulae.length, casks: snapshot.casks.length, basePath };
}

main(import.meta.url, async (args) => {
	const flags = options(args, { 'generated-dir': { type: 'string' }, 'output-dir': { type: 'string' } });
	const result = await verifyOutput({
		tapRoot: resolve(flags['tap-root']),
		configPath: flags.config && resolve(flags.config),
		generatedDir: flags['generated-dir'] && resolve(flags['generated-dir']),
		outputDir: flags['output-dir'] && resolve(flags['output-dir']),
	});
	console.log(`Verified static output: ${result.formulae} formulae, ${result.casks} casks; base ${result.basePath}`);
});
