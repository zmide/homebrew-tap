/** Native API data is deliberately not replaced with an application package model. */
export type Kind = 'formula' | 'cask';
export type CatalogIdentity = `${Kind}:${string}`;

export interface SearchEntry {
	kind: Kind;
	name: string;
	fullName: string;
	displayName: string;
	desc: string;
	version: string;
	aliases: string[];
	updatedAt: string | null;
}

export interface Enhancement {
	updatedAt?: string;
	links?: Record<string, string>;
}

export type Enhancements = Partial<Record<CatalogIdentity, Enhancement>>;

export interface CatalogSource {
	kind: Kind;
	name: string;
	path: string;
	sha256: string;
}

export interface CatalogRoute {
	kind: Kind;
	name: string;
	/** Relative URL-encoded path, without base path or trailing slash. */
	path: string;
	apiPath: string;
}

export interface ExportProvenance {
	schemaVersion: 1;
	tap: string;
	exportedAt: string;
	gitHead: string | null;
	inputSha256: string;
	sources: CatalogSource[];
	homebrew?: HomebrewProvenance;
}

export interface HomebrewProvenance {
	/** First line of brew --version; null for empty taps or legacy snapshots. */
	version: string | null;
	/** Host which evaluated the export, not a later offline build host. */
	platform: { os: string; arch: string; release: string } | null;
}

export interface CatalogManifest {
	schemaVersion: 1;
	generatedAt: string;
	tap: string;
	repository: string;
	site: { origin: string; basePath: string };
	input: { path: string; sha256: string };
	git: { head: string | null; dirty: boolean };
	homebrew: HomebrewProvenance;
	counts: Record<Kind, number>;
	sources: CatalogSource[];
	routes: CatalogRoute[];
	api: { formula: 'api/formula.json'; cask: 'api/cask.json' };
}
