import { packageVersion } from '../../../shared/homebrew-version.mjs';
import { fullName, packageName, packagePath } from './helpers';
import type { HomebrewPackage, PackageKind } from './types';

export const badgeStyles = ['flat', 'flat-square', 'for-the-badge'] as const;
export type BadgeStyle = (typeof badgeStyles)[number];
export type BadgeMode = 'version' | 'name' | 'custom';
export interface BadgeOptions {
	mode: BadgeMode;
	label: string;
	message: string;
	style: BadgeStyle;
	color: string;
}
export const defaultBadgeOptions: BadgeOptions = { mode: 'version', label: 'Homebrew', message: 'available', style: 'flat', color: 'orange' };
const colors = ['orange', 'blue', 'green', 'lightgrey'];
const cleanText = (value: string) =>
	value
		.replace(/\p{Cc}/gu, '')
		.trim()
		.slice(0, 80);

export function normalizeBadgeOptions(options: BadgeOptions): BadgeOptions {
	return {
		mode: ['version', 'name', 'custom'].includes(options.mode) ? options.mode : 'version',
		label: cleanText(options.label),
		message: cleanText(options.message) || 'available',
		style: badgeStyles.includes(options.style) ? options.style : 'flat',
		color: colors.includes(options.color) || /^(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(options.color) ? options.color : 'orange',
	};
}

export function badgePath(kind: PackageKind, name: string): string | undefined {
	const path = packagePath(kind, name);
	return path ? `/badges${path.slice(0, -1)}.json` : undefined;
}

/** Pure URL builder. The caller supplies the effective deployment base path. */
export function packageBadge(kind: PackageKind, item: HomebrewPackage, options: BadgeOptions, site: { origin: string; basePath: string }) {
	const name = packageName(kind, item);
	const path = packagePath(kind, name);
	if (!path) return undefined;
	const settings = normalizeBadgeOptions(options);
	const currentVersion = packageVersion(kind, item);
	const message = settings.mode === 'version' ? (currentVersion ?? 'unknown') : settings.mode === 'name' ? name : settings.message;
	const color = settings.mode === 'version' && !currentVersion ? 'lightgrey' : settings.color;
	const absolute = (path: string) => new URL(`${site.basePath.replace(/\/$/, '')}${path}`, site.origin).href;
	const detailUrl = absolute(path);
	const endpointUrl = absolute(badgePath(kind, name)!);
	const image = (endpoint: boolean) => {
		const url = new URL(endpoint ? 'https://img.shields.io/endpoint' : 'https://img.shields.io/static/v1');
		if (endpoint) url.searchParams.set('url', endpointUrl);
		else url.searchParams.set('message', message);
		for (const [key, value] of Object.entries({ label: settings.label, style: settings.style, logo: 'homebrew' })) url.searchParams.set(key, value);
		// Let endpoint metadata choose orange/grey as versions become known/unknown.
		if (!endpoint || settings.color !== defaultBadgeOptions.color) url.searchParams.set('color', color);
		return url.href;
	};
	const imageUrl = image(settings.mode === 'version');
	const alt = `Homebrew: ${fullName(kind, item)} (${kind})`;
	return {
		message,
		imageUrl,
		previewUrl: image(false),
		detailUrl,
		endpointUrl,
		alt,
		unknownVersion: settings.mode === 'version' && !currentVersion,
		markdown: `[![${alt}](${imageUrl})](${detailUrl})`,
	};
}
