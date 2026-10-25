import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, readFile, realpath, lstat } from 'node:fs/promises';
import { basename, resolve, relative, sep } from 'node:path';
import { assert, validateName } from './config.mjs';
import { arrayKeys, kinds, nativeName, validateSourcePath } from './native.mjs';

const execFileAsync = promisify(execFile);

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function run(command, args, options = {}) {
	const result = await execFileAsync(command, args, { maxBuffer: 64 * 1024 * 1024, ...options });
	return result.stdout;
}

export async function discoverSources(tapRoot) {
	const sources = [];
	for (const [directory, kind] of [
		['Formula', 'formula'],
		['Casks', 'cask'],
		['Cask', 'cask'],
	]) {
		async function walk(directoryPath) {
			let entries;
			try {
				assert(!(await lstat(resolve(tapRoot, directoryPath))).isSymbolicLink(), `Symlinks are not supported in source directories: ${directoryPath}`);
				entries = await readdir(resolve(tapRoot, directoryPath), { withFileTypes: true });
			} catch (error) {
				if (error.code === 'ENOENT' && directoryPath === directory) return;
				throw error;
			}
			for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
				const path = `${directoryPath}/${entry.name}`;
				assert(!entry.isSymbolicLink(), `Symlinks are not supported in source directories: ${path}`);
				if (entry.isDirectory()) await walk(path);
				else if (entry.isFile() && entry.name.endsWith('.rb')) {
					const name = validateName(basename(entry.name, '.rb'));
					validateSourcePath(path, kind);
					sources.push({ kind, name, path, sha256: sha256(await readFile(resolve(tapRoot, path))) });
				}
			}
		}
		await walk(directory);
	}
	const seen = new Set();
	for (const source of sources) {
		const id = `${source.kind}:${source.name}`;
		assert(!seen.has(id), `Duplicate source name: ${id}`);
		seen.add(id);
	}
	return sources;
}

export async function assertSnapshotSources(snapshot, sources, tapRoot) {
	for (const kind of kinds) {
		const expected = sources.filter((source) => source.kind === kind);
		const entries = snapshot[arrayKeys[kind]];
		assert(entries.length === expected.length, `${kind} count mismatch: discovered ${expected.length}, exported ${entries.length}`);
		for (const entry of entries) {
			const source = expected.find((source) => source.name === nativeName(kind, entry));
			assert(source && source.path === entry.ruby_source_path, `Source identity mismatch: ${kind}:${nativeName(kind, entry)}`);
			assert(source.sha256 === entry.ruby_source_checksum.sha256, `Source SHA256 mismatch: ${source.path}; the snapshot is stale`);
			if (tapRoot) {
				const actual = await realpath(resolve(tapRoot, source.path));
				const relativePath = relative(await realpath(tapRoot), actual);
				assert(!relativePath.startsWith(`..${sep}`) && !relativePath.startsWith(sep), `Source escapes tap root: ${source.path}`);
				assert(sha256(await readFile(actual)) === source.sha256, `Source changed while exporting: ${source.path}`);
			}
		}
	}
}

/** Commit date, not filesystem time; --follow preserves history across renames. */
export async function sourceUpdatedAt(tapRoot, sourcePath, execute = run) {
	const tracked = await execute('git', ['ls-files', '--error-unmatch', '--', sourcePath], { cwd: tapRoot }).catch(() => '');
	if (!tracked.trim()) return undefined;
	const date = (await execute('git', ['log', '-1', '--follow', '--format=%cI', '--', sourcePath], { cwd: tapRoot })).trim();
	if (!date) return undefined;
	assert(!Number.isNaN(Date.parse(date)), `Invalid Git commit timestamp for ${sourcePath}`);
	return new Date(date).toISOString();
}
