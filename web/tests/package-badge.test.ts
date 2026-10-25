import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import PackageBadge from '../components/catalog/package-badge';
import labels from '../locales/en/detail.json';
import { config, withBase } from '../lib/config';
import { defaultBadgeOptions, packageBadge } from '../lib/homebrew/badges';

vi.mock('../composables/locale', () => ({
	useCatalogLocale: () => ({
		localPath: (path: string) => `/zh-CN${path}`,
		t: (key: string) => labels[key.slice(7) as keyof typeof labels] ?? key,
	}),
}));
let wrapper: VueWrapper;
const writeText = vi.fn<(value: string) => Promise<void>>();
const item = { name: 'tool@2', full_name: 'example/tools/tool@2', versions: { stable: '2.0' } };
beforeEach(() => {
	vi.useFakeTimers();
	writeText.mockReset().mockResolvedValue(undefined);
	vi.stubGlobal('navigator', { clipboard: { writeText } });
});
afterEach(() => {
	wrapper?.unmount();
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});
const render = () => (wrapper = mount(PackageBadge, { props: { kind: 'formula', item } }));

describe('PackageBadge', () => {
	it('renders only the badge and copy control, with a local-language preview link and public Markdown', async () => {
		render();
		expect(wrapper.get('a').attributes('href')).toBe(withBase('/zh-CN/formula/tool%402/'));
		expect(wrapper.get('[data-badge-preview]').text()).toBe('Homebrew2.0');
		expect(wrapper.get('img').attributes('src')).toBe(withBase('/homebrew.svg'));
		expect(wrapper.find('[src*="shields.io"]').exists()).toBe(false);
		expect(wrapper.find('details, input, [role="combobox"]').exists()).toBe(false);
		expect(wrapper.findAll('button')).toHaveLength(1);
		expect(wrapper.get('button').text()).toBe('');
		expect(wrapper.get('button').attributes('aria-label')).toBe('Copy Markdown');
		expect(wrapper.get('button').attributes('aria-describedby')).toBe(wrapper.get('[role="tooltip"]').attributes('id'));
		expect(wrapper.get('[role="tooltip"]').text()).toBe('Copy Markdown');
		await wrapper.get('button').trigger('click');
		await flushPromises();
		const expected = packageBadge('formula', item, defaultBadgeOptions, { origin: config.site.origin, basePath: withBase('/') })!.markdown;
		expect(writeText).toHaveBeenCalledExactlyOnceWith(expected);
		expect(expected).not.toContain('/zh-CN/');
		expect(wrapper.get('[role="status"]').text()).toBe('Copied!');
		expect(wrapper.get('[role="status"]').classes()).toContain('sr-only');
		expect(wrapper.get('[role="tooltip"]').text()).toBe('Copied!');
		await vi.advanceTimersByTimeAsync(2500);
		expect(wrapper.get('[role="status"]').text()).toBe('');
		expect(wrapper.get('[role="tooltip"]').text()).toBe('Copy Markdown');
	});
	it('clears feedback when the package changes and copies the current package', async () => {
		render();
		await wrapper.get('button').trigger('click');
		await flushPromises();
		await wrapper.setProps({ item: { ...item, name: 'next', full_name: 'example/tools/next' } });
		expect(wrapper.get('[role="status"]').text()).toBe('');
		await wrapper.get('button').trigger('click');
		await flushPromises();
		expect(writeText.mock.calls.at(-1)![0]).toContain('/formula/next/');
	});
	it('waits for success and exposes selectable fallback code when copying fails', async () => {
		let reject!: (error: Error) => void;
		writeText.mockReturnValueOnce(
			new Promise((_, fail) => {
				reject = fail;
			}),
		);
		render();
		await wrapper.get('button').trigger('click');
		expect(wrapper.get('[role="status"]').text()).toBe('');
		reject(new Error('Denied'));
		await flushPromises();
		expect(wrapper.get('[role="status"]').text()).toContain('manually');
		expect(wrapper.findAll('code').some((code) => code.text().includes('[!['))).toBe(true);
		await vi.advanceTimersByTimeAsync(5000);
		expect(wrapper.get('[role="status"]').text()).toContain('manually');
		expect(wrapper.findAll('pre').filter((node) => !node.element.closest('noscript'))).toHaveLength(1);
		vi.stubGlobal('navigator', {});
		await wrapper.get('button').trigger('click');
		await flushPromises();
		expect(wrapper.get('[role="status"]').text()).toContain('manually');
		vi.stubGlobal('navigator', { clipboard: { writeText } });
		await wrapper.get('button').trigger('click');
		await flushPromises();
		expect(wrapper.get('[role="status"]').text()).toBe('Copied!');
		expect(wrapper.findAll('pre').filter((node) => !node.element.closest('noscript'))).toHaveLength(0);
	});
	it('renders current versions locally, including unknown versions and text needing escaping', async () => {
		render();
		await wrapper.setProps({ item: { ...item, versions: { stable: '<b>3.0</b>' }, revision: 2 } });
		expect(wrapper.get('[data-badge-preview]').text()).toBe('Homebrew<b>3.0</b>_2');
		expect(wrapper.find('b').exists()).toBe(false);
		expect(wrapper.get('[role="img"]').attributes('aria-label')).toContain('<b>3.0</b>_2');
		await wrapper.get('button').trigger('click');
		await flushPromises();
		expect(writeText).toHaveBeenCalledOnce();
		await wrapper.setProps({ item: { name: item.name, full_name: item.full_name } });
		expect(wrapper.get('[data-badge-preview]').text()).toBe('Homebrewunknown');
		expect(wrapper.get('[role="status"]').text()).toBe('');
	});
});
