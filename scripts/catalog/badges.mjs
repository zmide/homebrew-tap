import { packageVersion } from '../../shared/homebrew-version.mjs';

/** Shields endpoint sidecar; native API objects remain untouched. */
export function makeBadge(kind, item) {
	const version = packageVersion(kind, item);
	return {
		schemaVersion: 1,
		label: 'Homebrew',
		message: version ?? 'unknown',
		color: version ? 'orange' : 'lightgrey',
		namedLogo: 'homebrew',
	};
}
