import { isRecord, safeExternalUrl, variationEntries, withVariation } from './helpers';
import type { HomebrewPackage } from './types';

const macVersions: Record<string, string> = {
	golden_gate: '27',
	tahoe: '26',
	sequoia: '15',
	sonoma: '14',
	ventura: '13',
	monterey: '12',
	big_sur: '11',
	catalina: '10.15',
	mojave: '10.14',
	high_sierra: '10.13',
};

export function platformName(tag: string): string {
	if (tag === 'arm64_linux') return 'Linux / ARM64';
	if (tag === 'x86_64_linux') return 'Linux / x86_64';
	const version = tag.replace(/^arm64_/, '');
	if (macVersions[version]) return `macOS ${macVersions[version]} (${version.replaceAll('_', ' ')}) / ${tag.startsWith('arm64_') ? 'Apple Silicon' : 'Intel'}`;
	return tag;
}

export function platformMetadata(item: HomebrewPackage) {
	const depends = isRecord(item.depends_on) ? item.depends_on : {};
	const requirements = Array.isArray(item.requirements) ? item.requirements.filter(isRecord).filter((entry) => ['macos', 'linux', 'arch'].includes(String(entry.name))) : [];
	return {
		declared: Object.fromEntries(Object.entries(depends).filter(([name]) => ['macos', 'arch', 'system'].includes(name))),
		requirements,
		variations: variationEntries(item).map(([name]) => ({ name, label: platformName(name) })),
	};
}

export interface PlatformTarget {
	system: 'macOS' | 'Linux';
	architecture: string;
}

export function platformTarget(tag: string): PlatformTarget | undefined {
	if (['arm64_linux', 'x86_64_linux'].includes(tag)) return { system: 'Linux', architecture: tag.startsWith('arm64_') ? 'ARM64' : 'x86_64' };
	if (macVersions[tag.replace(/^arm64_/, '')]) return { system: 'macOS', architecture: tag.startsWith('arm64_') ? 'Apple Silicon' : 'Intel' };
	return undefined;
}

/** Explicit asset markers establish download availability, not general compatibility. */
export function binaryPlatform(item: HomebrewPackage): PlatformTarget | undefined {
	const urls = isRecord(item.urls) ? item.urls : {};
	const stable = isRecord(urls.stable) ? urls.stable : {};
	const url = safeExternalUrl(stable.url) ?? safeExternalUrl(item.url);
	if (!url) return undefined;
	const filename = new URL(url).pathname.split('/').pop() ?? '';
	const match = filename.match(/(?:^|[_-])(darwin|macos|linux)[_-](arm64|aarch64|amd64|x86_64)(?=[_.-]|$)/i);
	if (!match) return undefined;
	const system = match[1]!.toLowerCase() === 'linux' ? 'Linux' : 'macOS';
	const arm = ['arm64', 'aarch64'].includes(match[2]!.toLowerCase());
	return { system, architecture: system === 'macOS' ? (arm ? 'Apple Silicon' : 'Intel') : arm ? 'ARM64' : 'x86_64' };
}

export function binaryPlatforms(item: HomebrewPackage) {
	const rows = new Map<string, PlatformTarget>();
	for (const record of [item, ...variationEntries(item).map(([name]) => withVariation(item, name))]) {
		const platform = binaryPlatform(record);
		if (platform) rows.set(`${platform.system}/${platform.architecture}`, platform);
	}
	return [...rows.values()];
}
