import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import labels from '../locales/en/common.json';
import { config } from '../lib/config';
import type { CatalogEntry } from '../lib/search';
import PackageBrowser from '../components/catalog/package-browser';

vi.mock('../composables/locale', () => ({
	useCatalogLocale: () => ({
		locale: { value: 'en' },
		localPath: (path: string) => path,
		t: (key: string) => {
			const [group, name] = key.split('.');
			return (labels as Record<string, Record<string, string>>)[group!]?.[name!] ?? key;
		},
	}),
}));

let wrapper: VueWrapper | undefined;
afterEach(() => {
	wrapper?.unmount();
	vi.unstubAllGlobals();
});

const entries: CatalogEntry[] = Array.from({ length: config.recentLimit + 2 }, (_, index) => ({
	kind: 'formula',
	name: `tool-${index}`,
	fullName: `example/tap/tool-${index}`,
	displayName: `Tool ${index}`,
	desc: `Description ${index}`,
	version: '1.0',
	aliases: [],
	updatedAt: '2026-10-01T00:00:00Z',
}));

function render(items = entries, kind?: 'formula' | 'cask') {
	const route = reactive({ query: {} });
	const replace = vi.fn(async ({ query }: { query: Record<string, unknown> }) => {
		route.query = query;
	});
	vi.stubGlobal('useRoute', () => route);
	vi.stubGlobal('useRouter', () => ({ replace }));
	wrapper = mount(PackageBrowser, { props: { entries: items, kind } });
	return { wrapper, replace };
}

describe('PackageBrowser presentation controls', () => {
	it('shows the dedicated browse-all control only after a truncated recent list and preserves name sorting', async () => {
		const { wrapper, replace } = render();
		expect(wrapper.findAll('.package-row')).toHaveLength(config.recentLimit);
		expect(wrapper.get('.browse-all').text()).toBe('Browse all');
		await wrapper.get('.browse-all').trigger('click');
		await flushPromises();
		expect(replace).toHaveBeenCalledWith({ query: expect.objectContaining({ sort: 'name' }) });
		expect(wrapper.findAll('.package-row')).toHaveLength(entries.length);
		expect(wrapper.find('.browse-all').exists()).toBe(false);
	});
	it('does not render a browse-all control for short lists or category pages', async () => {
		const { wrapper } = render(entries.slice(0, config.recentLimit));
		expect(wrapper.find('.browse-all').exists()).toBe(false);
		await wrapper.setProps({ entries, kind: 'formula' });
		expect(wrapper.find('.browse-all').exists()).toBe(false);
		expect(wrapper.findAll('.package-row')).toHaveLength(entries.length);
	});
	it('hides browse-all during a search without changing the search interaction', async () => {
		const { wrapper } = render();
		await wrapper.get('input').setValue('tool-1');
		await flushPromises();
		expect(wrapper.find('.browse-all').exists()).toBe(false);
		expect(wrapper.findAll('.package-row').length).toBeGreaterThan(0);
	});
});
