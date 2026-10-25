import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

export function options(args, extra = {}) {
	return parseArgs({ args, strict: true, options: { 'tap-root': { type: 'string', default: repositoryRoot }, config: { type: 'string' }, ...extra } }).values;
}

export async function writeJson(path, value) {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function main(moduleUrl, callback) {
	if (process.argv[1] && moduleUrl === pathToFileURL(resolve(process.argv[1])).href) {
		callback(process.argv.slice(2)).catch((error) => {
			console.error(`catalog: ${error.message}`);
			process.exitCode = 1;
		});
	}
}
