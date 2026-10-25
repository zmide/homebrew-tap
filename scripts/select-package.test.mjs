import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('accepts registered dispatch and manual inputs, rejects unsafe inputs', async (t) => {
	const dir = await mkdtemp(path.join(tmpdir(), 'tap-package-'));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const eventPath = path.join(dir, 'event.json');
	const outputPath = path.join(dir, 'output');
	const script = fileURLToPath(new URL('./select-package.mjs', import.meta.url));
	async function run(input, manual = false) {
		await writeFile(eventPath, JSON.stringify(manual ? { inputs: input } : { client_payload: input }));
		await writeFile(outputPath, '');
		return spawnSync(process.execPath, [script], {
			encoding: 'utf8',
			env: { ...process.env, GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: outputPath, GITHUB_EVENT_NAME: manual ? 'workflow_dispatch' : 'repository_dispatch' },
		});
	}
	for (const manual of [false, true]) {
		assert.equal((await run({ package: 'oci-mirror-proxy', tag: 'v1.2.3' }, manual)).status, 0);
		assert.match(await readFile(outputPath, 'utf8'), /repository=runui\/oci-mirror-proxy\n/);
	}
	for (const name of ['__proto__', '../bad', 'unknown', undefined]) {
		assert.notEqual((await run({ package: name, tag: 'v1.2.3' })).status, 0);
	}
	for (const tag of ['v1.2.3-beta', 'v01.2.3', 'v1.2.3\n', '$(id)', undefined]) {
		assert.notEqual((await run({ package: 'oci-mirror-proxy', tag })).status, 0);
	}
});
