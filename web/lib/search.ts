export interface CatalogEntry {
	kind: 'formula' | 'cask';
	name: string;
	fullName: string;
	displayName: string;
	desc: string;
	version: string;
	aliases: string[];
	updatedAt?: string | null;
}

export function searchPackages(entries: CatalogEntry[], query: string, kind = 'all', sort = 'updated'): CatalogEntry[] {
	const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
	return entries
		.filter((entry) => {
			const text = [entry.name, entry.fullName, entry.displayName, entry.desc, ...entry.aliases].join(' ').toLocaleLowerCase();
			return (kind === 'all' || entry.kind === kind) && words.every((word) => text.includes(word));
		})
		.sort((a, b) => {
			if (sort === 'updated') {
				const difference = (Date.parse(b.updatedAt || '') || 0) - (Date.parse(a.updatedAt || '') || 0);
				if (difference) return difference;
			}
			return a.name.localeCompare(b.name, 'en') || a.kind.localeCompare(b.kind);
		});
}
