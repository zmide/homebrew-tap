import { describe, expect, it } from 'vitest';
import { demo, index, loadPackage, declarations } from '../demo/catalog-data';
import { analyticsWindows } from '../lib/homebrew/analytics';

describe('isolated local demo catalog', () => {
	it('contains only explicitly named demonstration packages and matching records', async () => {
		expect(demo).toBe(true);
		expect(index).toHaveLength(10);
		for (const entry of index) {
			expect(entry.name.startsWith('demo-')).toBe(true);
			expect(await loadPackage(entry.kind, entry.name)).not.toBeNull();
		}
		expect(await loadPackage('formula', 'oci-mirror-proxy')).toBeNull();
		expect(await loadPackage('formula', 'demo-studio')).toBeNull();
	});
	it('covers all analytics ranges, zero values, mixed platform states and native unknown fields', async () => {
		const stats = await loadPackage('formula', 'demo-statistics');
		expect(analyticsWindows(stats?.analytics).map((window) => window.range)).toEqual(['30d', '90d', '365d']);
		expect(analyticsWindows(stats?.analytics)[0]?.errors).toBe(0);
		expect(declarations['formula:demo-platforms']![1]!.architectures.map((arch) => arch.status)).toEqual(['unknown', 'unsupported']);
		expect((await loadPackage('formula', 'demo-complete'))?.demo_unknown_field).toEqual({ preserved: true });
	});
});
