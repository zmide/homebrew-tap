/** Homebrew's native JSON is the source of truth. Unknown fields stay intact. */
export type PackageKind = 'formula' | 'cask';

export interface NativeRecord extends Record<string, unknown> {}

export interface NativePackage extends NativeRecord {
	tap?: string;
	desc?: string | null;
	homepage?: string;
	license?: string | null;
	tap_git_head?: string;
	ruby_source_path?: string;
	ruby_source_checksum?: NativeRecord;
	variations?: Record<string, NativeRecord>;
	deprecated?: boolean;
	deprecation_date?: string | null;
	deprecation_reason?: string | null;
	disabled?: boolean;
	disable_date?: string | null;
	disable_reason?: string | null;
	deprecation_replacement_formula?: string | null;
	deprecation_replacement_cask?: string | null;
	disable_replacement_formula?: string | null;
	disable_replacement_cask?: string | null;
	deprecate_args?: NativeRecord | null;
	disable_args?: NativeRecord | null;
	caveats?: string | null;
}

export interface Formula extends NativePackage {
	name: string;
	full_name?: string;
	aliases?: string[];
	oldnames?: string[];
	versions?: NativeRecord & { stable?: string | null; head?: string | null; bottle?: boolean };
	pkg_version?: string;
	revision?: number;
	version_scheme?: number;
	urls?: NativeRecord;
	dependencies?: string[];
	build_dependencies?: string[];
	test_dependencies?: string[];
	optional_dependencies?: string[];
	no_linkage_dependencies?: string[];
	recommended_dependencies?: string[];
	runtime_dependencies?: NativeRecord[];
	uses_from_macos?: Array<string | NativeRecord>;
	uses_from_macos_bounds?: NativeRecord[];
	requirements?: NativeRecord[];
	keg_only?: boolean;
	keg_only_reason?: NativeRecord;
	bottle?: NativeRecord;
	service?: NativeRecord | null;
}

export interface Cask extends NativePackage {
	token: string;
	full_token?: string;
	name: string[];
	old_tokens?: string[];
	version?: string | null;
	url?: string;
	sha256?: string;
	artifacts?: NativeRecord[];
	depends_on?: NativeRecord;
	conflicts_with?: NativeRecord | null;
	supported_platforms?: unknown;
	languages?: string[];
	auto_updates?: boolean | null;
	caveats_rosetta?: boolean | null;
	requires_rosetta?: boolean;
}

export type HomebrewPackage = Formula | Cask;

/** Small, derived search records; never a replacement for the native objects. */
export interface SearchEntry {
	kind: PackageKind;
	name: string;
	fullName: string;
	displayName: string;
	desc: string;
	version: string;
	aliases: string[];
	updatedAt?: string | null;
}

export interface Dependency {
	name: string;
	kind: PackageKind;
	detail?: string;
}

export interface DependencyGroup {
	key: string;
	dependencies: Dependency[];
}

export interface PackageNotice {
	type: 'disable' | 'deprecate';
	scheduled: boolean;
	date?: string;
	reason?: string;
	replacements: Dependency[];
}

export interface BottleRow {
	target: string;
	cellar?: string;
	url?: string;
	sha256?: string;
}
