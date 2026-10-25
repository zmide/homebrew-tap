const text = (value) => (typeof value === 'string' && value.trim() ? value : undefined);

/** Display versions only: never mutate the native Homebrew record. */
export function packageVersion(kind, item) {
	if (kind === 'cask') return text(item.version);
	if (text(item.pkg_version)) return item.pkg_version;
	const stable = text(item.versions?.stable);
	if (!stable) return text(item.versions?.head) ? 'HEAD' : undefined;
	const revision = Number.isInteger(item.revision) && item.revision > 0 ? `_${item.revision}` : '';
	return `${stable}${revision}`;
}
