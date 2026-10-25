import { readFile, appendFile } from 'node:fs/promises';

const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
const input = process.env.GITHUB_EVENT_NAME === 'repository_dispatch' ? event.client_payload : event.inputs;
const packages = {
	'oci-mirror-proxy': {
		repository: 'runui/oci-mirror-proxy',
		generator: 'scripts/packages/oci-mirror-proxy.mjs',
		inspectService: true,
	},
};
const name = input?.package;
if (!Object.hasOwn(packages, name)) throw new Error('Unsupported package');
const tag = input.tag;
if (typeof tag !== 'string' || tag !== tag.trim() || !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag)) {
	throw new Error('Expected a stable vMAJOR.MINOR.PATCH tag');
}
await appendFile(
	process.env.GITHUB_OUTPUT,
	Object.entries({
		package: name,
		tag,
		...packages[name],
		formula: `Formula/${name}.rb`,
	})
		.map(([key, value]) => `${key}=${value}\n`)
		.join(''),
);
