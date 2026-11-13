const namePattern = /^[A-Za-z0-9][A-Za-z0-9+@._-]*$/;
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:alpha|beta|rc)\.?(0|[1-9]\d*))?$/;

export function versionedPackage(name) {
	if (!namePattern.test(name)) return undefined;
	const match = /^([^@]+)@(\d+(?:\.\d+)*(?:-[a-z]+\.?\d+)?)$/.exec(name);
	return match ? { name: match[1], version: match[2], fixed: versionPattern.test(match[2]) } : undefined;
}

export function packageRoute(kind, name) {
	if (!['formula', 'cask'].includes(kind) || !namePattern.test(name)) return undefined;
	const parsed = versionedPackage(name);
	return parsed?.fixed ? `/${kind}/${encodeURIComponent(parsed.name)}/v/${encodeURIComponent(parsed.version)}/` : `/${kind}/${encodeURIComponent(name)}/`;
}

export function parsePackageRoute(path) {
	try {
		const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
		if (!parts.length) return {};
		const [kind, name, marker, version] = parts;
		if (!['formula', 'cask'].includes(kind)) return undefined;
		if (parts.length === 1) return { kind };
		if (!namePattern.test(name)) return undefined;
		if (parts.length === 2) return { kind, name };
		if (parts.length === 4 && marker === 'v' && !name.includes('@') && versionPattern.test(version)) return { kind, name: `${name}@${version}` };
	} catch {
		return undefined;
	}
	return undefined;
}

/** Keep the native index intact; only discovery surfaces use representatives. */
export function visiblePackages(entries) {
	const groups = new Map();
	for (const entry of entries) {
		const parsed = versionedPackage(entry.name);
		const key = `${entry.kind}:${parsed?.name ?? entry.name}`;
		const previous = groups.get(key);
		if (!previous || (!parsed && versionedPackage(previous.name)) || (parsed && versionedPackage(previous.name) && compareNames(entry.name, previous.name) > 0))
			groups.set(key, entry);
	}
	return [...groups.values()];
}

function compareNames(left, right) {
	const a = versionedPackage(left).version;
	const b = versionedPackage(right).version;
	const stable = Number(!a.includes('-')) - Number(!b.includes('-'));
	return stable || a.localeCompare(b, 'en', { numeric: true }) || left.localeCompare(right, 'en');
}
