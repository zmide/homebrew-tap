import { assert, isRecord, validateFullName, validateName, validateTap } from './config.mjs';

export const kinds = ['formula', 'cask'];
export const arrayKeys = { formula: 'formulae', cask: 'casks' };

export function nativeName(kind, entry) {
	return kind === 'formula' ? entry.name : entry.token;
}

export function nativeFullName(kind, entry) {
	return kind === 'formula' ? entry.full_name : entry.full_token;
}

export function identity(kind, entry) {
	return `${kind}:${nativeFullName(kind, entry)}`;
}

export function validateSourcePath(sourcePath, kind) {
	const roots = kind === 'formula' ? ['Formula'] : ['Casks', 'Cask'];
	assert(typeof sourcePath === 'string' && !sourcePath.includes('\\'), `Invalid ruby_source_path: ${String(sourcePath)}`);
	const parts = sourcePath.split('/');
	assert(
		roots.includes(parts[0]) && parts.length >= 2 && parts.every((part) => /^[A-Za-z0-9@+._-]+$/.test(part) && part !== '.' && part !== '..') && sourcePath.endsWith('.rb'),
		`Unsafe ${kind} ruby_source_path: ${sourcePath}`,
	);
	return sourcePath;
}

/** Native Homebrew v2 objects are returned by reference; unknown fields survive. */
export function validateNative(snapshot, { tap } = {}) {
	validateTap(tap);
	assert(isRecord(snapshot), 'Homebrew v2 JSON must be an object');
	for (const kind of kinds) {
		const entries = snapshot[arrayKeys[kind]];
		assert(Array.isArray(entries), `Homebrew v2 ${arrayKeys[kind]} must be an array`);
		const names = new Set();
		const paths = new Set();
		for (const entry of entries) {
			assert(isRecord(entry), `Invalid ${kind} object`);
			const name = validateName(nativeName(kind, entry));
			const fullName = validateFullName(nativeFullName(kind, entry), tap);
			assert(fullName === `${tap}/${name}` && entry.tap === tap, `Mismatched ${kind} identity: ${fullName}`);
			assert(!names.has(name), `Duplicate ${kind}: ${fullName}`);
			names.add(name);
			validateSourcePath(entry.ruby_source_path, kind);
			assert(!paths.has(entry.ruby_source_path), `Duplicate ${kind} ruby_source_path: ${entry.ruby_source_path}`);
			paths.add(entry.ruby_source_path);
			assert(isRecord(entry.ruby_source_checksum) && /^[a-f0-9]{64}$/.test(entry.ruby_source_checksum.sha256), `Missing or invalid source SHA256: ${fullName}`);
			assert(isRecord(entry.variations), `Missing --variations data: ${fullName}`);
			assert(entry.desc === undefined || entry.desc === null || typeof entry.desc === 'string', `Invalid description: ${fullName}`);
			if (kind === 'formula') {
				assert(isRecord(entry.versions) && (entry.versions.stable === null || typeof entry.versions.stable === 'string'), `Invalid formula versions: ${fullName}`);
				assert(Array.isArray(entry.aliases), `Invalid formula aliases: ${fullName}`);
				for (const alias of entry.aliases) {
					if (typeof alias === 'string' && alias.includes('/')) validateFullName(alias, tap);
					else validateName(alias, 'alias');
				}
			} else {
				assert(
					Array.isArray(entry.name) && entry.name.every((name) => typeof name === 'string') && typeof entry.version === 'string',
					`Invalid cask name/version: ${fullName}`,
				);
			}
		}
	}
	return snapshot;
}

export function routePath(kind, name) {
	assert(kinds.includes(kind), `Invalid route kind: ${kind}`);
	validateName(name);
	return `${kind}/${encodeURIComponent(name)}`;
}
