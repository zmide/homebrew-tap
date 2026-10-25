import type { CatalogEntry } from '../lib/search';
import type { Formula, Cask, HomebrewPackage, PackageKind } from '../lib/homebrew/types';
import type { SupportDeclaration } from '../lib/homebrew/detail-view';
import { packageVersion } from '../../shared/homebrew-version.mjs';

export const demo = true;
const formula = (name: string, extra: Partial<Formula> = {}): Formula => ({
	name,
	full_name: `demo/local/${name}`,
	tap: 'demo/local',
	desc: 'Local demonstration fixture - not a real package.',
	versions: { stable: '2.4.1', head: 'HEAD' },
	aliases: [],
	dependencies: [],
	homepage: 'https://example.com/demo',
	urls: { stable: { url: 'https://example.com/demo/source.tar.gz' } },
	license: 'MIT',
	...extra,
});
const complete = formula('demo-complete', {
	desc: 'Complete Formula: dependencies, caveats, service and native metadata.',
	revision: 2,
	aliases: ['demo-cli'],
	oldnames: ['demo-old'],
	dependencies: ['openssl@3', 'sqlite'],
	build_dependencies: ['cmake', 'pkgconf'],
	test_dependencies: ['python@3.13'],
	optional_dependencies: ['redis'],
	keg_only: true,
	keg_only_reason: { reason: ':versioned_formula', explanation: 'This fixture demonstrates a versioned, keg-only tool.' },
	caveats: 'Create your configuration before starting the service:\n  demo-complete init\n\nRun the service as your current user. Documentation: https://example.com/demo/docs',
	service: { run: ['/opt/homebrew/opt/demo-complete/bin/demo-complete', 'serve'], keep_alive: true, log_path: '/opt/homebrew/var/log/demo.log' },
	conflicts_with: ['demo-legacy'],
	demo_unknown_field: { preserved: true },
});
const statistics = formula('demo-statistics', {
	desc: 'Simulated analytics: grouped rolling-window columns for each recorded installation option.',
	analytics: {
		install: {
			'30d': { 'demo-statistics': 48497, 'demo-statistics --HEAD': 105, 'demo-statistics --with-a-very-long-experimental-option': 32 },
			'90d': { 'demo-statistics': 120450, 'demo-statistics --HEAD': 324 },
			'365d': { 'demo-statistics': 510234, 'demo-statistics --HEAD': 1520 },
		},
		install_on_request: { '30d': { 'demo-statistics': 42000 }, '90d': { 'demo-statistics': 100200 }, '365d': { 'demo-statistics': 480123 } },
		build_error: { '30d': { 'demo-statistics': 0 }, '90d': { 'demo-statistics': 12 }, '365d': { 'demo-statistics': 38 } },
	},
});
const platforms = formula('demo-platforms', {
	desc: 'Mixed support states and platform-specific dependencies and service configuration.',
	dependencies: ['openssl@3'],
	service: { run: ['demo-platforms', 'serve'], keep_alive: true },
	variations: {
		arm64_linux: { dependencies: ['openssl@3', 'util-linux'], service: { run: ['demo-platforms', 'serve', '--linux'], keep_alive: false } },
		x86_64_linux: { dependencies: ['util-linux'], service: null },
	},
});
const app: Cask = {
	token: 'demo-studio',
	full_token: 'demo/local/demo-studio',
	tap: 'demo/local',
	name: ['Demo Studio', 'Demo Editor'],
	version: '4.2.0',
	desc: 'Cask fixture: application, requirements, uninstall and cleanup instructions.',
	homepage: 'https://example.com/studio',
	url: 'https://example.com/studio.dmg',
	auto_updates: true,
	requires_rosetta: true,
	languages: ['en', 'zh-CN'],
	depends_on: { macos: { '>=': ['13'] }, formula: ['git'] },
	artifacts: [
		{ app: ['Demo Studio.app'] },
		{ binary: ['/Applications/Demo Studio.app/Contents/MacOS/demo'] },
		{ uninstall: [{ quit: 'com.example.demo', delete: '/Applications/Demo Studio.app' }] },
		{ zap: [{ trash: ['~/Library/Preferences/com.example.demo.plist', '~/Library/Application Support/Demo Studio'] }] },
	],
	caveats: 'This application and its cleanup paths are demonstration data only.',
};
const packages: Array<{ kind: PackageKind; item: HomebrewPackage }> = [
	...[
		complete,
		statistics,
		formula('demo-statistics-partial', {
			desc: 'Missing annual window and different categories per period.',
			analytics: {
				install: {
					'30d': { 'demo-statistics-partial': 240, 'demo-statistics-partial --HEAD': 40 },
					'90d': { 'demo-statistics-partial': 750, 'demo-statistics-partial --experimental': 120 },
				},
			},
		}),
		formula('demo-statistics-many', {
			desc: 'Twelve separate installation options; only the chart scrolls on narrow screens.',
			analytics: {
				install: Object.fromEntries(
					['30d', '90d', '365d'].map((range, period) => [
						range,
						Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`demo-statistics-many --option-${index + 1}`, (period + 1) * (index + 1) * 100])),
					]),
				),
			},
		}),
		platforms,
		formula('demo-deprecated', {
			deprecated: true,
			deprecation_date: '2025-01-01',
			deprecation_reason: 'unmaintained',
			deprecation_replacement_formula: 'demo/local/demo-complete',
		}),
		formula('demo-disabled', { disabled: true, disable_date: '2025-01-01', disable_reason: 'does_not_build', disable_replacement_formula: 'demo/local/demo-complete' }),
		{ name: 'demo-minimal', full_name: 'demo/local/demo-minimal', versions: { stable: '1.0' }, desc: 'Minimal Formula: optional sections must be absent.' },
		formula('demo-a-very-long-package-name-for-small-screen-layout-testing', {
			desc: 'Long content, explicit zero analytics and wrapping checks.',
			dependencies: ['a-very-long-dependency-name-for-wrapping-checks', 'openssl@3'],
			analytics: { install: { '90d': { 'demo-zero': 0 } } },
		}),
	].map((item) => ({ kind: 'formula' as const, item })),
	{ kind: 'cask', item: app },
];
export const index: CatalogEntry[] = packages.map(({ kind, item }) => {
	const name = String(kind === 'formula' ? item.name : item.token);
	return {
		kind,
		name,
		fullName: `demo/local/${name}`,
		displayName: kind === 'cask' ? (item as Cask).name[0]! : name,
		desc: item.desc || '',
		version: packageVersion(kind, item) ?? '',
		aliases: [],
		updatedAt: '2026-10-01T12:00:00Z',
	};
});
const supported: SupportDeclaration[] = [
	{
		system: 'macOS',
		source: 'https://example.com/demo/support',
		architectures: [
			{ name: 'Apple Silicon', status: 'supported' },
			{ name: 'Intel', status: 'supported' },
		],
	},
	{
		system: 'Linux',
		source: 'https://example.com/demo/support',
		architectures: [
			{ name: 'ARM64', status: 'supported' },
			{ name: 'x86_64', status: 'supported' },
		],
	},
];
export const declarations: Record<string, SupportDeclaration[]> = {
	'formula:demo-complete': supported,
	'formula:demo-statistics': supported,
	'formula:demo-platforms': [
		supported[0]!,
		{
			...supported[1]!,
			architectures: [
				{ name: 'ARM64', status: 'unknown' },
				{ name: 'x86_64', status: 'unsupported' },
			],
		},
	],
};
export async function loadPackage(kind: PackageKind, name: string): Promise<HomebrewPackage | null> {
	return packages.find((entry) => entry.kind === kind && (kind === 'formula' ? entry.item.name : entry.item.token) === name)?.item ?? null;
}
