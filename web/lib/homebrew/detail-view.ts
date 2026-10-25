import { bottleRows, dependencyGroups, hasValue, isRecord, safeExternalUrl, strings, text, variationEntries, withVariation } from './helpers';
import { binaryPlatform, platformTarget } from './platforms';
import type { HomebrewPackage, PackageKind } from './types';

export type SupportStatus = 'supported' | 'unsupported' | 'unknown';
export interface SupportDeclaration {
	system: 'macOS' | 'Linux';
	architectures: Array<{ name: string; status: SupportStatus }>;
	source: string;
}
export interface PlatformSupport extends SupportDeclaration {
	architectures: Array<SupportDeclaration['architectures'][number] & { availability?: 'download' | 'bottle' }>;
	minimum?: string;
	bottleTargets?: string[];
}

function nativeSupport(kind: PackageKind, item: HomebrewPackage, target: string): PlatformSupport[] {
	const groups = new Map<string, PlatformSupport>();
	const groupFor = (system: SupportDeclaration['system']) => {
		const group = groups.get(system) ?? { system, architectures: [], source: '' };
		groups.set(system, group);
		return group;
	};
	for (const bottle of bottleRows(item)) {
		const platform = platformTarget(bottle.target);
		if (!platform) continue;
		const group = groupFor(platform.system);
		group.bottleTargets ??= [];
		if (!group.bottleTargets.includes(bottle.target)) group.bottleTargets.push(bottle.target);
		if (!group.architectures.some((arch) => arch.name === platform.architecture))
			group.architectures.push({ name: platform.architecture, status: 'supported', availability: 'bottle' });
	}
	const binary = binaryPlatform(item);
	if (binary) {
		const group = groupFor(binary.system);
		group.architectures = group.architectures.filter((arch) => arch.name !== binary.architecture);
		group.architectures.push({ name: binary.architecture, status: 'supported', availability: 'download' });
	}
	const depends = isRecord(item.depends_on) ? item.depends_on : {};
	// Each variation is evaluated independently: one target's limits must not
	// overwrite a different target's availability or minimum system version.
	const requirements = Array.isArray(item.requirements)
		? item.requirements
				.filter(isRecord)
				.filter((entry) => entry.optional !== true && (!Array.isArray(entry.contexts) || !entry.contexts.length || entry.contexts.includes('run')))
		: [];
	if (kind === 'cask') {
		const declared = Array.isArray(depends.arch)
			? depends.arch.map((arch) => (typeof arch === 'string' ? arch : isRecord(arch) ? text(arch.type) : undefined)).filter(Boolean)
			: [];
		const group = groupFor('macOS');
		const knownArchitectures = declared.filter((arch) => ['intel', 'x86_64', 'arm', 'arm64'].includes(arch!));
		group.architectures = ['Apple Silicon', 'Intel'].map((name) => {
			if (knownArchitectures.length)
				return {
					name,
					status: knownArchitectures.some((arch) => (name === 'Intel' ? ['intel', 'x86_64'] : ['arm', 'arm64']).includes(arch!)) ? 'supported' : 'unsupported',
				};
			return group.architectures.find((arch) => arch.name === name) ?? { name, status: 'unknown' };
		});
	}
	for (const requirement of requirements) {
		if (!['macos', 'linux'].includes(String(requirement.name))) continue;
		const system = requirement.name === 'macos' ? 'macOS' : 'Linux';
		if (target && platformTarget(target)?.system !== system) continue;
		const group = groupFor(system);
		if (!group.architectures.length) group.architectures = (system === 'macOS' ? ['Apple Silicon', 'Intel'] : ['ARM64', 'x86_64']).map((name) => ({ name, status: 'unknown' }));
		const version = text(requirement.version);
		if (version) group.minimum = `>= ${version}`;
	}
	const architectureRequirement = requirements.find((requirement) => requirement.name === 'arch');
	const requiredArchitecture = text(architectureRequirement?.version);
	if (requiredArchitecture && ['arm64', 'x86_64'].includes(requiredArchitecture)) {
		for (const group of groups.values()) {
			const names = group.system === 'macOS' ? ['Apple Silicon', 'Intel'] : ['ARM64', 'x86_64'];
			group.architectures = names.map((name, index) =>
				(requiredArchitecture === 'arm64') === (index === 0)
					? (group.architectures.find((arch) => arch.name === name) ?? { name, status: 'unknown' })
					: { name, status: 'unsupported' },
			);
		}
	}
	if (groups.has('macOS') && isRecord(depends.macos)) {
		const constraints = Object.entries(depends.macos).flatMap(([operator, versions]) => strings(versions).map((version) => `${operator} ${version}`));
		if (constraints.length) groups.get('macOS')!.minimum = constraints.join(', ');
	}
	return [...groups.values()];
}

/** Infer from native data first; reviewed declarations are optional overrides. */
export function platformSupport(
	kind: PackageKind,
	item: HomebrewPackage,
	declarations: Array<{ system: string; architectures: Array<{ name: string; status: string }>; source: string }> = [],
): PlatformSupport[] {
	const groups = new Map<string, PlatformSupport>();
	const rank = (arch: PlatformSupport['architectures'][number]) =>
		arch.status === 'supported' ? (arch.availability === 'bottle' ? 2 : arch.availability === 'download' ? 3 : 4) : arch.status === 'unknown' ? 1 : 0;
	for (const target of ['', ...variationEntries(item).map(([name]) => name)]) {
		for (const platform of nativeSupport(kind, withVariation(item, target), target)) {
			const group = groups.get(platform.system);
			if (!group) {
				groups.set(platform.system, platform);
				continue;
			}
			for (const arch of platform.architectures) {
				const previous = group.architectures.findIndex((entry) => entry.name === arch.name);
				if (previous === -1) group.architectures.push(arch);
				else if (rank(arch) > rank(group.architectures[previous]!)) group.architectures[previous] = arch;
			}
			if (group.minimum !== platform.minimum) delete group.minimum;
			if (platform.bottleTargets?.length) group.bottleTargets = [...new Set([...(group.bottleTargets ?? []), ...platform.bottleTargets])];
		}
	}
	for (const declaration of declarations) {
		if (!safeExternalUrl(declaration.source) || !['macOS', 'Linux'].includes(declaration.system)) continue;
		const architectures = declaration.architectures
			.filter((arch) => arch.name.trim() && ['supported', 'unsupported', 'unknown'].includes(arch.status))
			.map((arch) => ({ name: arch.name, status: arch.status as SupportStatus }));
		if (!architectures.length) continue;
		const group = groups.get(declaration.system) ?? { system: declaration.system as 'macOS' | 'Linux', architectures: [], source: '' };
		group.source = declaration.source;
		group.architectures = [...architectures, ...group.architectures.filter((arch) => !architectures.some((override) => override.name === arch.name))];
		groups.set(declaration.system, group);
	}
	return [...groups.values()];
}

export function visibleArtifacts(item: HomebrewPackage) {
	return (Array.isArray(item.artifacts) ? item.artifacts : []).filter(isRecord).flatMap((artifact) => Object.entries(artifact).filter(([, value]) => hasValue(value)));
}

export interface NoteBlock {
	type: 'text' | 'command' | 'pre';
	value: string;
}
export function noteBlocks(value: unknown): NoteBlock[] {
	if (typeof value !== 'string' || !value.trim()) return [];
	return value
		.trimEnd()
		.split(/\n\s*\n/)
		.map((paragraph) => paragraph.split('\n'))
		.flatMap((lines): NoteBlock[] => {
			const blocks: NoteBlock[] = [];
			for (const line of lines) {
				// Only standalone, indented commands with a conservative executable name.
				const command = /^\s{2,}(?:(?:brew|[\w.-]+)\s+(?:services\s+)?(?:init|start|stop|restart|serve|install|link|unlink|info)\b[^\n]*|\$ [^\n]+)$/.test(line);
				const type = command ? 'command' : /^\s{2,}\S/.test(line) && !/^\s*https?:\/\//.test(line) ? 'pre' : 'text';
				const previous = blocks.at(-1);
				const content = command ? line.trim().replace(/^\$ /, '') : line.trimEnd();
				if (previous?.type === type) previous.value += `\n${content}`;
				else blocks.push({ type, value: content.trim() });
			}
			return blocks;
		});
}

export function uniqueLinks<T extends { href?: string }>(links: T[]): Array<T & { href: string }> {
	const seen = new Set<string>();
	return links.filter((link): link is T & { href: string } => {
		if (!link.href || seen.has(link.href)) return false;
		seen.add(link.href);
		return true;
	});
}

function platformViews<T>(item: HomebrewPackage, read: (record: HomebrewPackage) => T, visible: (value: T) => boolean) {
	const grouped = new Map<string, { targets: string[]; value: T }>();
	const records = ['', ...variationEntries(item).map(([name]) => name)].map((target) => ({ target, value: read(withVariation(item, target)) }));
	const distinct = new Set(records.map((record) => JSON.stringify(record.value))).size > 1;
	for (const record of records) {
		if (!visible(record.value)) continue;
		const key = JSON.stringify(record.value);
		const view = grouped.get(key) ?? { targets: [], value: record.value };
		if (distinct) view.targets.push(record.target);
		grouped.set(key, view);
	}
	return [...grouped.values()];
}

export function dependencyViews(kind: PackageKind, item: HomebrewPackage) {
	return platformViews(
		item,
		(record) => dependencyGroups(kind, record),
		(groups) => groups.length > 0,
	).map((view) => ({ targets: view.targets, groups: view.value }));
}

export function serviceViews(item: HomebrewPackage) {
	return platformViews(item, (record) => record.service, hasValue);
}
