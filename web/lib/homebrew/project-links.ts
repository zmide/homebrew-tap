import { isRecord, safeExternalUrl, variationEntries, withVariation } from './helpers';
import type { HomebrewPackage } from './types';

export interface ProjectLinks {
	repository?: string;
	releases?: string;
}

/** Recognize repository/download URLs, not arbitrary paths on a GitHub-like host. */
function githubRepository(value: unknown): string | undefined {
	const safe = safeExternalUrl(value);
	if (!safe) return undefined;
	const url = new URL(safe);
	if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port) return undefined;
	const match =
		/^\/([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(url.pathname) ??
		/^\/([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9_.-]+)\/(?:releases(?:\/.*)?|archive\/.+|tree\/.+)$/.exec(url.pathname);
	if (!match || ['.', '..'].includes(match[2]!)) return undefined;
	return `https://github.com/${match[1]}/${match[2]!.replace(/\.git$/, '')}`;
}

/** Keep derived links out of native API records; never request upstream metadata. */
export function projectLinks(item: HomebrewPackage, overrides: ProjectLinks = {}): ProjectLinks {
	const repositories = new Set<string>();
	for (const record of [item, ...variationEntries(item).map(([name]) => withVariation(item, name))]) {
		const urls = isRecord(record.urls) ? record.urls : {};
		for (const value of [record.url, ...['stable', 'head'].map((name) => (isRecord(urls[name]) ? urls[name].url : undefined))]) {
			const repository = githubRepository(value);
			if (repository) repositories.add(repository);
		}
	}
	// Prefer package downloads to a documentation homepage. Conflicting upstream
	// repositories are ambiguous and require an explicit override instead.
	const inferredRepository = repositories.size === 1 ? [...repositories][0] : repositories.size === 0 ? githubRepository(item.homepage) : undefined;
	const repository = safeExternalUrl(overrides.repository) ?? inferredRepository;
	const releases = safeExternalUrl(overrides.releases) ?? (repository ? githubRepository(repository) : undefined)?.concat('/releases');
	return {
		...(repository ? { repository } : {}),
		...(releases ? { releases } : {}),
	};
}
