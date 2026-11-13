export function versionedPackage(name: string): { name: string; version: string; fixed: boolean } | undefined;
export function packageRoute(kind: string, name: string): string | undefined;
export function parsePackageRoute(path: string): { kind?: 'formula' | 'cask'; name?: string } | undefined;
export function visiblePackages<T extends { kind: string; name: string }>(entries: readonly T[]): T[];
