import { readFile } from 'node:fs/promises';

export function assert(condition, message) {
	if (!condition) throw new Error(message);
}

export function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateName(name, label = 'package name') {
	assert(typeof name === 'string' && /^[a-z0-9][a-z0-9@+._-]*$/.test(name) && name !== '.' && name !== '..', `Invalid ${label}: ${String(name)}`);
	return name;
}

export function validateTap(tap) {
	assert(typeof tap === 'string' && /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/.test(tap), 'tap must be an explicit owner/name');
	return tap;
}

export function validateFullName(fullName, tap) {
	assert(typeof fullName === 'string' && fullName.startsWith(`${tap}/`), `Package identity must belong to ${tap}: ${String(fullName)}`);
	validateName(fullName.slice(tap.length + 1));
	return fullName;
}

export function validateBasePath(basePath) {
	assert(typeof basePath === 'string' && /^\/(?:[A-Za-z0-9_-]+\/)*$/.test(basePath), 'site.basePath must be / or a safe slash-delimited path with a trailing slash');
	return basePath;
}

function validateUrl(value, label, originOnly = false) {
	assert(typeof value === 'string', `${label} must be an HTTP(S) URL`);
	let url;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`${label} must be an HTTP(S) URL`);
	}
	assert(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password, `${label} must be an HTTP(S) URL without credentials`);
	if (originOnly) assert(url.pathname === '/' && !url.search && !url.hash, `${label} must contain only an origin`);
}

/** Validate without stripping unknown configuration keys. */
export function validateConfig(config) {
	assert(isRecord(config), 'Configuration must be an object');
	validateTap(config.tap);
	validateUrl(config.repository, 'repository');
	assert(isRecord(config.brand), 'brand must be an object');
	for (const field of ['name', 'title', 'description']) assert(typeof config.brand[field] === 'string' && config.brand[field].trim(), `brand.${field} must be a nonempty string`);
	if (config.brand.descriptionZh !== undefined) assert(typeof config.brand.descriptionZh === 'string', 'brand.descriptionZh must be a string');
	assert(isRecord(config.site), 'site must be an object');
	validateUrl(config.site.origin, 'site.origin', true);
	validateBasePath(config.site.basePath);
	assert(isRecord(config.i18n) && Array.isArray(config.i18n.locales) && config.i18n.locales.length > 0, 'i18n.locales must be a nonempty array');
	assert(
		config.i18n.locales.every((locale) => typeof locale === 'string' && /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale)),
		'i18n.locales contains an invalid locale',
	);
	assert(
		new Set(config.i18n.locales).size === config.i18n.locales.length && config.i18n.locales.includes(config.i18n.defaultLocale),
		'i18n.defaultLocale must be included in unique locales',
	);
	assert(Number.isInteger(config.recentLimit) && config.recentLimit > 0 && config.recentLimit <= 100, 'recentLimit must be an integer from 1 to 100');
	if (config.links !== undefined) {
		assert(isRecord(config.links), 'links must be an object');
		for (const [identity, links] of Object.entries(config.links)) {
			const match = /^(formula|cask):(.+)$/.exec(identity);
			assert(match, `Invalid links identity: ${identity}`);
			validateFullName(match[2], config.tap);
			assert(isRecord(links), `links.${identity} must be an object`);
			for (const [key, value] of Object.entries(links)) validateUrl(value, `links.${identity}.${key}`);
		}
	}
	if (config.platformSupport !== undefined) {
		assert(isRecord(config.platformSupport), 'platformSupport must be an object');
		for (const [identity, platforms] of Object.entries(config.platformSupport)) {
			const match = /^(formula|cask):(.+)$/.exec(identity);
			assert(match, `Invalid platformSupport identity: ${identity}`);
			validateFullName(match[2], config.tap);
			assert(Array.isArray(platforms), `platformSupport.${identity} must be an array`);
			const systems = new Set();
			for (const platform of platforms) {
				assert(isRecord(platform) && ['macOS', 'Linux'].includes(platform.system) && !systems.has(platform.system), `Invalid or duplicate platform in ${identity}`);
				systems.add(platform.system);
				validateUrl(platform.source, `platformSupport.${identity}.source`);
				assert(Array.isArray(platform.architectures) && platform.architectures.length > 0, `Missing architectures in ${identity}`);
				const names = new Set();
				for (const architecture of platform.architectures) {
					assert(
						isRecord(architecture) &&
							typeof architecture.name === 'string' &&
							architecture.name.trim() &&
							!names.has(architecture.name) &&
							['supported', 'unsupported', 'unknown'].includes(architecture.status),
						`Invalid architecture in ${identity}`,
					);
					names.add(architecture.name);
				}
			}
		}
	}
	return config;
}

export async function readConfig(path) {
	return validateConfig(JSON.parse(await readFile(path, 'utf8')));
}
