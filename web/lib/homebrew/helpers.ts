import type { BottleRow, Dependency, DependencyGroup, HomebrewPackage, NativeRecord, PackageKind, PackageNotice } from './types';
import { packageVersion } from '../../../shared/homebrew-version.mjs';

export function isRecord(value: unknown): value is NativeRecord {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function text(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value : undefined;
}

export function strings(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((item): item is string => !!text(item)) : [];
}

export function hasValue(value: unknown): boolean {
	if (value === undefined || value === null || value === '') return false;
	if (typeof value === 'string') return value.trim().length > 0;
	if (Array.isArray(value)) return value.length > 0;
	if (isRecord(value)) return Object.keys(value).length > 0;
	return true;
}

/** Plain source text: render directly or as escaped syntax tokens, never as HTML. */
export function formatValue(value: unknown): string {
	if (typeof value === 'string') return value;
	if (value === undefined || value === null) return '';
	return JSON.stringify(value, null, 2) ?? '';
}

const namePattern = /^[A-Za-z0-9][A-Za-z0-9+@._-]*$/;
const tapPartPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function validPackageName(value: unknown): value is string {
	return typeof value === 'string' && namePattern.test(value);
}

export function validFullName(value: unknown): value is string {
	if (typeof value !== 'string') return false;
	const parts = value.split('/');
	return parts.length === 1 ? validPackageName(value) : parts.length === 3 && parts.slice(0, 2).every((part) => tapPartPattern.test(part)) && validPackageName(parts[2]);
}

export function packageName(kind: PackageKind, item: HomebrewPackage): string {
	const name = kind === 'formula' ? item.name : item.token;
	return validPackageName(name) ? name : '';
}

export function fullName(kind: PackageKind, item: HomebrewPackage): string {
	const full = kind === 'formula' ? item.full_name : item.full_token;
	if (validFullName(full)) return full;
	const name = packageName(kind, item);
	const qualified = `${item.tap}/${name}`;
	return name && validFullName(qualified) ? qualified : name;
}

export function identity(kind: PackageKind, item: HomebrewPackage): string {
	return `${kind}:${fullName(kind, item)}`;
}

export function displayName(kind: PackageKind, item: HomebrewPackage): string {
	return (kind === 'cask' ? strings(item.name)[0] : undefined) || packageName(kind, item);
}

export function version(kind: PackageKind, item: HomebrewPackage): string {
	return packageVersion(kind, item) ?? '—';
}

export function installCommand(kind: PackageKind, item: HomebrewPackage): string {
	const name = fullName(kind, item);
	return name ? `brew install ${kind === 'cask' ? '--cask ' : ''}${name}` : '';
}

/** Only absolute HTTP(S) links are navigable; native file/ftp URLs stay as text. */
export function safeExternalUrl(value: unknown): string | undefined {
	if (
		typeof value !== 'string' ||
		!/^https?:\/\//i.test(value) ||
		/[\s\\]/.test(value) ||
		[...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
	)
		return undefined;
	try {
		const url = new URL(value);
		return ['https:', 'http:'].includes(url.protocol) && url.hostname && !url.username && !url.password ? url.href : undefined;
	} catch {
		return undefined;
	}
}

export function packagePath(kind: PackageKind, name: string): string | undefined {
	return validPackageName(name) ? `/${kind}/${encodeURIComponent(name)}/` : undefined;
}

export function apiPath(kind: PackageKind, name: string): string | undefined {
	return validPackageName(name) ? `/api/${kind}/${encodeURIComponent(name)}.json` : undefined;
}

export interface DependencyLinkOptions {
	tap: string;
	localPath?: (path: string) => string;
	/** Unqualified names are core unless the catalog confirms a local identity. */
	localPackages?: ReadonlyArray<{ kind: PackageKind; name: string }>;
}

export interface PackageLink {
	href: string;
	external: boolean;
}

export function dependencyLink(name: string, kind: PackageKind, options: DependencyLinkOptions): PackageLink | undefined {
	if (!validFullName(name)) return undefined;
	const parts = name.split('/');
	const leaf = parts.at(-1)!;
	const tap = parts.length === 3 ? parts.slice(0, 2).join('/') : undefined;
	const knownLocal = !tap && options.localPackages?.some((item) => item.kind === kind && item.name === leaf);
	if (tap === options.tap || knownLocal) {
		const path = packagePath(kind, leaf)!;
		return { href: options.localPath ? options.localPath(path) : path, external: false };
	}
	if (!tap || tap === 'homebrew/core' || tap === 'homebrew/cask') {
		const coreKind = tap === 'homebrew/cask' ? 'cask' : tap === 'homebrew/core' ? 'formula' : kind;
		return { href: `https://formulae.brew.sh/${coreKind}/${encodeURIComponent(leaf)}`, external: true };
	}
	// Third-party taps may shard Ruby sources. Search the actual tap repository,
	// rather than inventing a formulae.brew.sh page or an unverified .rb path.
	return {
		href: `https://github.com/${parts[0]}/homebrew-${parts[1]}/search?q=${encodeURIComponent(`${leaf} language:Ruby`)}&type=code`,
		external: true,
	};
}

export function validSourcePath(kind: PackageKind, value: unknown): value is string {
	if (typeof value !== 'string') return false;
	const parts = value.split('/');
	const roots = kind === 'formula' ? ['Formula'] : ['Cask', 'Casks'];
	return roots.includes(parts[0]!) && parts.length >= 2 && value.endsWith('.rb') && parts.every((part) => /^[A-Za-z0-9@+._-]+$/.test(part) && part !== '.' && part !== '..');
}

/** A commit-pinned source link, never a guessed Ruby filename or branch. */
export function sourceLink(kind: PackageKind, item: HomebrewPackage, repository: string): string | undefined {
	const safeRepository = safeExternalUrl(repository);
	if (!safeRepository || !validSourcePath(kind, item.ruby_source_path) || typeof item.tap_git_head !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(item.tap_git_head))
		return undefined;
	const url = new URL(safeRepository);
	if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.search || url.hash || !/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(url.pathname))
		return undefined;
	const root = url.pathname.replace(/\/$/, '').replace(/\.git$/, '');
	return `${url.origin}${root}/blob/${item.tap_git_head}/${item.ruby_source_path.split('/').map(encodeURIComponent).join('/')}`;
}

export function variationEntries(item: HomebrewPackage): Array<[string, NativeRecord]> {
	return isRecord(item.variations) ? Object.entries(item.variations).filter((entry): entry is [string, NativeRecord] => isRecord(entry[1])) : [];
}

/** Official variations are top-level deltas, not recursively merged documents. */
export function withVariation(item: HomebrewPackage, variation?: string): HomebrewPackage {
	const delta = variationEntries(item).find(([name]) => name === variation)?.[1];
	return delta ? ({ ...item, ...delta } as HomebrewPackage) : item;
}

function dependencies(value: unknown, kind: PackageKind): Dependency[] {
	return strings(value).map((name) => ({ name, kind }));
}

export function dependencyGroups(kind: PackageKind, item: HomebrewPackage): DependencyGroup[] {
	const groups: DependencyGroup[] = [];
	if (kind === 'formula') {
		for (const key of ['dependencies', 'build_dependencies', 'test_dependencies', 'recommended_dependencies', 'optional_dependencies', 'no_linkage_dependencies']) {
			groups.push({ key, dependencies: dependencies(item[key], 'formula') });
		}
		const runtime = Array.isArray(item.runtime_dependencies) ? item.runtime_dependencies : [];
		groups.push({
			key: 'runtime_dependencies',
			dependencies: runtime.filter(isRecord).flatMap((entry) => {
				const name = text(entry.full_name) ?? text(entry.name);
				return name ? [{ name, kind: 'formula' as const, detail: text(entry.version) }] : [];
			}),
		});
		const macos = Array.isArray(item.uses_from_macos) ? item.uses_from_macos : [];
		groups.push({
			key: 'uses_from_macos',
			dependencies: macos.flatMap((entry): Dependency[] =>
				typeof entry === 'string'
					? [{ name: entry, kind: 'formula' }]
					: isRecord(entry)
						? Object.entries(entry).map(([name, detail]) => ({ name, kind: 'formula', detail: formatValue(detail) }))
						: [],
			),
		});
	} else {
		const dependsOn = isRecord(item.depends_on) ? item.depends_on : {};
		for (const type of ['formula', 'cask'] as const) groups.push({ key: `${type}_dependencies`, dependencies: dependencies(dependsOn[type], type) });
	}
	return groups.filter((group) => group.dependencies.length > 0);
}

export function bottleRows(item: HomebrewPackage): BottleRow[] {
	const bottle = isRecord(item.bottle) ? item.bottle : {};
	const stable = isRecord(bottle.stable) ? bottle.stable : {};
	const files = isRecord(stable.files) ? stable.files : {};
	return Object.entries(files)
		.filter((entry): entry is [string, NativeRecord] => isRecord(entry[1]))
		.map(([target, bottle]) => ({
			target,
			cellar: text(bottle.cellar),
			url: safeExternalUrl(bottle.url),
			sha256: text(bottle.sha256),
		}));
}

function validDate(value: unknown): value is string {
	return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function packageNotices(item: HomebrewPackage, now = new Date()): PackageNotice[] {
	const today = now.toISOString().slice(0, 10);
	return (['disable', 'deprecate'] as const).flatMap((type): PackageNotice[] => {
		const prefix = type === 'disable' ? 'disable' : 'deprecation';
		const args = item[`${type}_args`];
		const nativeArgs = isRecord(args) ? args : {};
		const nativeDate = item[`${prefix}_date`] ?? nativeArgs.date;
		const date = validDate(nativeDate) ? nativeDate : undefined;
		if (item[type === 'disable' ? 'disabled' : 'deprecated'] !== true && !date) return [];
		const replacements: Dependency[] = [];
		for (const kind of ['formula', 'cask'] as const) {
			const value = item[`${prefix}_replacement_${kind}`] ?? nativeArgs[`replacement_${kind}`];
			for (const name of typeof value === 'string' ? [value] : strings(value)) replacements.push({ name, kind });
		}
		return [{ type, scheduled: !!date && date > today, date, reason: text(item[`${prefix}_reason`]) ?? text(nativeArgs.because), replacements }];
	});
}

/** Homebrew currently exports this as caveats_rosetta, not an inferred CPU rule. */
export function rosettaRequirement(item: HomebrewPackage): boolean | undefined {
	if (typeof item.caveats_rosetta === 'boolean') return item.caveats_rosetta;
	return typeof item.requires_rosetta === 'boolean' ? item.requires_rosetta : undefined;
}
