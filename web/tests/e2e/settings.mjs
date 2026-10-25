import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const appConfig = JSON.parse(readFileSync(new URL('../../../tap.config.json', import.meta.url), 'utf8'));
export const basePath = process.env.NUXT_APP_BASE_URL || appConfig.site.basePath;
if (typeof basePath !== 'string' || !/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(basePath) || basePath.split('/').some((part) => part === '.' || part === '..')) {
	throw new Error('NUXT_APP_BASE_URL/site.basePath must be a safe absolute path with a trailing slash');
}

export const port = Number(process.env.PLAYWRIGHT_PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PLAYWRIGHT_PORT must be a valid TCP port');
export const host = '127.0.0.1';
export const origin = `http://${host}:${port}`;
export const baseURL = `${origin}${basePath}`;
export const webDirectory = fileURLToPath(new URL('../../', import.meta.url));
export const publicDirectory = fileURLToPath(new URL('../../.output/public/', import.meta.url));
