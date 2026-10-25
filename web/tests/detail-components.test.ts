import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import detailLabels from '../locales/en/detail.json';
import PackageDetail from '../components/catalog/package-detail';
import CodeBlock from '../components/catalog/code-block';
import HelpTip from '../components/catalog/help-tip';
import PlatformSupport from '../components/catalog/platform-support';
import styles from '../lib/homebrew/package-detail.module.scss';
import snapshot from '../../scripts/catalog/fixtures/info.v2.raw?raw';

vi.mock('../composables/locale', () => ({
	useCatalogLocale: () => ({
		locale: { value: 'en' },
		localPath: (path: string) => path,
		t: (key: string) => (key.startsWith('detail.') ? (detailLabels[key.slice(7) as keyof typeof detailLabels] ?? key) : key),
	}),
}));
vi.mock('../components/ui/button', () => ({
	Button: defineComponent({
		setup:
			(_, { attrs, slots }) =>
			() =>
				h('button', attrs, slots.default?.()),
	}),
}));

let wrapper: VueWrapper | undefined;
afterEach(() => {
	wrapper?.unmount();
	vi.unstubAllGlobals();
});

describe('detail components', () => {
	it('renders a minimal formula without empty content sections or duplicate API links', () => {
		wrapper = mount(PackageDetail, { props: { kind: 'formula', item: { name: 'minimal', versions: { stable: '1' } } } });
		const headings = wrapper.findAll('h2').map((node) => node.text());
		expect(headings).toEqual(['Install with Homebrew', 'Platform support', 'Package information', 'More links']);
		expect(wrapper.findAll('table')).toHaveLength(0);
		expect(wrapper.findAll('a').filter((node) => node.text().includes('Native JSON API'))).toHaveLength(1);
	});
	it('renders cask limits, meaningful false values and nonempty artifacts', () => {
		wrapper = mount(PackageDetail, {
			props: {
				kind: 'cask',
				item: {
					token: 'app',
					name: ['App'],
					version: '2',
					auto_updates: false,
					requires_rosetta: true,
					depends_on: { macos: { '>=': ['13'] } },
					artifacts: [{ app: ['App.app'] }, { binary: [] }],
				},
			},
		});
		expect(wrapper.text()).toContain('macOS >= 13');
		expect(wrapper.text()).toContain('Unconfirmed');
		expect(wrapper.text()).toContain('Requires Rosetta');
		expect(wrapper.find('aside').text()).toContain('Auto-updatesNo');
		expect(wrapper.findAll('h2').map((node) => node.text())).toContain('Artifacts');
		expect(wrapper.findAll('dt').map((node) => node.text())).not.toContain('binary');
		expect(wrapper.find('.command code').text()).toBe('brew install --cask app');
	});
	it('renders the real package platforms and upstream links without supplemental configuration', () => {
		wrapper = mount(PackageDetail, { props: { kind: 'formula', item: JSON.parse(snapshot).formulae[0] } });
		const support = wrapper.get('section[aria-label="Platform support"]');
		expect(support.findAll('h3').map((node) => node.text())).toEqual(['macOS', 'Linux']);
		expect(support.findAll('li')).toHaveLength(4);
		for (const arch of support.findAll('li')) {
			expect(arch.text()).toContain('Binary available');
			expect(arch.text()).not.toContain('Not supported');
		}
		expect(support.text()).toContain('not compatibility with every system version');
		expect(wrapper.find('a[href="https://github.com/runui/oci-mirror-proxy"]').exists()).toBe(true);
		expect(wrapper.find('a[href="https://github.com/runui/oci-mirror-proxy/releases"]').exists()).toBe(true);
	});
	it('deduplicates inferred repository and homepage links and honors explicit project links', async () => {
		wrapper = mount(PackageDetail, { props: { kind: 'formula', item: { name: 'tool', homepage: 'https://github.com/example/tool' } } });
		expect(wrapper.findAll('a[href="https://github.com/example/tool"]')).toHaveLength(1);
		await wrapper.setProps({ links: { repository: 'https://example.com/source', releases: 'https://example.com/downloads' } });
		expect(wrapper.find('a[href="https://example.com/source"]').exists()).toBe(true);
		expect(wrapper.find('a[href="https://example.com/downloads"]').exists()).toBe(true);
		expect(wrapper.find('a[href="https://github.com/example/tool/releases"]').exists()).toBe(false);
	});
	it('shows platform-specific dependencies and services without an inspection selector', () => {
		wrapper = mount(PackageDetail, {
			props: {
				kind: 'formula',
				item: {
					name: 'tool',
					versions: { stable: '1' },
					dependencies: ['base'],
					service: { run: ['tool'] },
					variations: { arm64_linux: { dependencies: ['linux-only'], service: null } },
				},
			},
		});
		expect(wrapper.text()).toContain('linux-only');
		expect(wrapper.text()).toContain('Linux / ARM64');
		expect(wrapper.findAll('h2').map((node) => node.text())).toContain('Service');
		expect(wrapper.find('[role="combobox"]').exists()).toBe(false);
	});
	it('keeps dependency variants and categories in separate spacing containers', () => {
		wrapper = mount(PackageDetail, {
			props: {
				kind: 'formula',
				item: {
					name: 'tool',
					dependencies: ['openssl@3', 'sqlite'],
					build_dependencies: ['cmake'],
					test_dependencies: ['python@3.13'],
					variations: { arm64_linux: { dependencies: ['util-linux'] } },
				},
			},
		});
		const variants = wrapper.findAll(`.${styles.dependencyVariant}`);
		expect(variants).toHaveLength(2);
		for (const variant of variants) {
			const categories = variant.get(`.${styles.dependencyCategories}`).findAll(`.${styles.dependencyCategory}`);
			expect(categories.map((category) => category.get('h3').text())).toEqual(['Dependencies', 'Required to build', 'Required to test']);
			for (const category of categories) expect(category.findAll('ul > li').length).toBeGreaterThan(0);
		}
		expect(variants[0]!.findAll('li a').map((link) => link.text())).toEqual(['openssl@3', 'sqlite', 'cmake', 'python@3.13']);
		expect(variants[1]!.text()).toContain('Linux / ARM64');
	});
	it('renders semantic decorative icons for every platform status without changing availability labels', () => {
		wrapper = mount(PlatformSupport, {
			props: {
				rosetta: true,
				platforms: [
					{
						system: 'Linux',
						source: 'https://example.com/support',
						architectures: [
							{ name: 'ARM64', status: 'supported' },
							{ name: 'x86_64', status: 'unsupported' },
							{ name: 'Other', status: 'unknown' },
							{ name: 'Bottle', status: 'supported', availability: 'bottle' },
							{ name: 'Binary', status: 'supported', availability: 'download' },
						],
					},
				],
			},
		});
		const rows = wrapper.findAll('li');
		const icons = ['circle-check', 'circle-x', 'circle-minus', 'circle-check', 'circle-check'];
		const labels = ['Supported', 'Not supported', 'Unconfirmed', 'Bottle available', 'Binary available'];
		rows.forEach((row, index) => {
			const state = row.get(`.${styles.supportState}`);
			expect(state.text()).toBe(labels[index]);
			expect(state.get('svg').classes()).toContain(`lucide-${icons[index]}`);
			expect(state.get('svg').attributes()).toMatchObject({ 'aria-hidden': 'true', 'stroke-width': '1.5' });
			expect(state.findAll('svg')).toHaveLength(1);
		});
		expect(wrapper.get('button[aria-label="About Rosetta"] svg').classes()).toContain('lucide-circle-help');
	});
	it('copies the exact standalone command and reports rejection', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('navigator', { clipboard: { writeText } });
		wrapper = mount(CodeBlock, { props: { code: 'tool init\n', language: 'bash', copyable: true } });
		await wrapper.get('button').trigger('click');
		await flushPromises();
		expect(writeText).toHaveBeenCalledWith('tool init\n');
		expect(wrapper.get('[role="status"]').text()).toBe('copy.copied');
		writeText.mockRejectedValue(new Error('Denied'));
		await wrapper.get('button').trigger('click');
		await flushPromises();
		expect(wrapper.get('[role="status"]').text()).toBe('copy.failed');
	});
	it('opens help on focus and closes on Escape', async () => {
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
			callback(0);
			return 0;
		});
		wrapper = mount(HelpTip, { props: { label: 'About platform configuration', text: 'An explanation' }, attachTo: document.body });
		await wrapper.get('button').trigger('focus');
		expect(wrapper.get('button').attributes('aria-expanded')).toBe('true');
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		await flushPromises();
		expect(wrapper.get('button').attributes('aria-expanded')).toBe('false');
	});
});
