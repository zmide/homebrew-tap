import { resolve, basename } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { release } from 'node:os';
import { assert, readConfig } from './config.mjs';
import { main, options, writeJson } from './cli.mjs';
import { arrayKeys, kinds, validateNative } from './native.mjs';
import { assertSnapshotSources, discoverSources, run, sha256 } from './sources.mjs';

export function provenancePath(snapshotPath) {
	return resolve(dirname(snapshotPath), `${basename(snapshotPath, '.json')}.provenance.json`);
}

export async function checkoutHead(tapRoot, execute = run) {
	const head = (await execute('git', ['rev-parse', 'HEAD'], { cwd: tapRoot }).catch(() => '')).trim();
	return /^[a-f0-9]{40,64}$/.test(head) ? head : null;
}

/** Never force API mode off: that can unexpectedly clone homebrew/core. */
export function brewEnvironment(environment = process.env) {
	const env = { ...environment, HOMEBREW_NO_AUTO_UPDATE: '1', HOMEBREW_NO_ANALYTICS: '1', HOMEBREW_NO_BOOTSNAP: '1' };
	delete env.HOMEBREW_NO_INSTALL_FROM_API;
	return env;
}

export async function exportCatalog({
	tapRoot,
	configPath = resolve(tapRoot, 'tap.config.json'),
	output = resolve(tapRoot, 'web/.generated/info.v2.json'),
	execute = run,
	env = process.env,
}) {
	const config = await readConfig(configPath);
	const sources = await discoverSources(tapRoot);
	const brewOptions = { env: brewEnvironment(env), cwd: tapRoot };
	let registeredRoot;
	let registeredSources = [];
	if (sources.length) {
		try {
			registeredRoot = (await execute('brew', ['--repo', config.tap], brewOptions)).trim();
		} catch {
			throw new Error(`Tap ${config.tap} is not registered. Register it explicitly; export never modifies developer taps.`);
		}
		assert(registeredRoot, `No registered path for ${config.tap}`);
		registeredSources = await discoverSources(registeredRoot);
		assert(
			JSON.stringify(registeredSources) === JSON.stringify(sources),
			`Registered tap ${config.tap} is stale or differs from --tap-root. Register/synchronize the intended checkout explicitly; export will not modify it.`,
		);
	}
	const parts = [];
	for (const kind of kinds) {
		const names = sources.filter((source) => source.kind === kind).map((source) => `${config.tap}/${source.name}`);
		if (!names.length) continue;
		// Explicit kind prevents ambiguity when a formula and cask share a name.
		// Fully-qualified names prevent evaluating unrelated/global formulae.
		const raw = await execute('brew', ['info', '--json=v2', '--variations', `--${kind}`, ...names], brewOptions);
		const data = validateNative(JSON.parse(raw), config);
		assert(data[arrayKeys[kind === 'formula' ? 'cask' : 'formula']].length === 0, `Unexpected kind returned by brew --${kind}`);
		parts.push({ kind, raw, data });
	}
	// An empty tap needs no Homebrew invocation or registration. Never call info
	// with no names: that would query unrelated installed/global packages.
	let snapshot = parts[0]?.data ?? { formulae: [], casks: [] };
	let raw = parts[0]?.raw ?? `${JSON.stringify(snapshot, null, 2)}\n`;
	if (parts.length > 1) {
		snapshot = { ...snapshot };
		for (const part of parts.slice(1)) {
			for (const [key, value] of Object.entries(part.data)) {
				if (Object.values(arrayKeys).includes(key)) snapshot[key] = [...snapshot[key], ...value];
				else {
					assert(!Object.hasOwn(snapshot, key) || JSON.stringify(snapshot[key]) === JSON.stringify(value), `Conflicting native Homebrew envelope key: ${key}`);
					snapshot[key] = value;
				}
			}
		}
		raw = `${JSON.stringify(snapshot, null, 2)}\n`;
	}
	validateNative(snapshot, config);
	await assertSnapshotSources(snapshot, sources, tapRoot);
	await assertSnapshotSources(snapshot, registeredSources, registeredRoot);
	const homebrew = {
		version: sources.length ? (await execute('brew', ['--version'], brewOptions)).trim().split(/\r?\n/)[0] || null : null,
		platform: { os: process.platform, arch: process.arch, release: release() },
	};
	await mkdir(dirname(output), { recursive: true });
	// Preserve every native response byte-for-byte, including when both kinds are
	// combined into the same native v2 envelope. No app fields are introduced.
	for (const part of parts) await writeFile(resolve(dirname(output), `${basename(output, '.json')}.${part.kind}.raw.json`), part.raw);
	await writeFile(output, raw);
	await writeJson(provenancePath(output), {
		schemaVersion: 1,
		tap: config.tap,
		exportedAt: new Date().toISOString(),
		gitHead: await checkoutHead(tapRoot, execute),
		inputSha256: sha256(raw),
		homebrew,
		sources,
	});
	return { output, formulae: snapshot.formulae.length, casks: snapshot.casks.length };
}

main(import.meta.url, async (args) => {
	const flags = options(args, { output: { type: 'string' } });
	const result = await exportCatalog({ tapRoot: resolve(flags['tap-root']), configPath: flags.config && resolve(flags.config), output: flags.output && resolve(flags.output) });
	console.log(`Exported ${result.formulae} formulae and ${result.casks} casks to ${result.output}`);
});
