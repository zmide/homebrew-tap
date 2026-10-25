import rawIndex from '../.generated/search-index.json';
import type { CatalogEntry } from './search';
import type { HomebrewPackage, PackageKind } from './homebrew/types';

export const index = (Array.isArray(rawIndex) ? rawIndex : (rawIndex as { entries: CatalogEntry[] }).entries) as CatalogEntry[];
const loaders = import.meta.glob('../.generated/public/api/{formula,cask}/*.json', { import: 'default' });
export async function loadPackage(kind: PackageKind, name: string): Promise<HomebrewPackage | null> {
	const load = loaders[`../.generated/public/api/${kind}/${name}.json`];
	return load ? ((await load()) as HomebrewPackage) : null;
}
