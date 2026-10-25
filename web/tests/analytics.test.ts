import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { analyticsChart, analyticsWindows } from '../lib/homebrew/analytics';
import PackageStatistics from '../components/catalog/package-statistics';
import labels from '../locales/en/detail.json';

vi.mock('../composables/locale', () => ({
	useCatalogLocale: () => ({
		locale: { value: 'en' },
		t: (key: string, args: Record<string, unknown> = {}) => (labels[key.replace('detail.', '') as keyof typeof labels] ?? key).replace('{{count}}', String(args.count)),
	}),
}));

const analytics = { install: { '30d': { tool: 100, 'tool --HEAD': 5 }, '365d': { tool: 1000 } }, install_on_request: { '30d': { tool: 90 } }, build_error: { '30d': { tool: 0 } } };

describe('native Homebrew analytics', () => {
	it('sums all option entries, preserves zero and omits missing windows', () => {
		expect(analyticsWindows(analytics)).toEqual([
			{
				range: '30d',
				installs: [
					{ name: 'tool', count: 100 },
					{ name: 'tool --HEAD', count: 5 },
				],
				total: 105,
				requested: 90,
				errors: 0,
			},
			{ range: '365d', installs: [{ name: 'tool', count: 1000 }], total: 1000, requested: undefined, errors: undefined },
		]);
	});
	it('rejects malformed values and overflow rather than turning unknown into zero', () => {
		for (const value of [
			null,
			{},
			{ install: {} },
			{ install: { '30d': {} } },
			...[-1, '100', NaN, Infinity].map((count) => ({ install: { '30d': { tool: count } } })),
			{ install: { '30d': { a: Number.MAX_SAFE_INTEGER, b: 1 } } },
		])
			expect(analyticsWindows(value)).toEqual([]);
		expect(analyticsWindows({ install: { '90d': { tool: 0 } } })[0]?.total).toBe(0);
	});
	it('renders every available range and individual record with the longest-window headline', async () => {
		const wrapper = mount(PackageStatistics, { props: { analytics } });
		expect(wrapper.findAll('button[aria-pressed="true"]')).toHaveLength(2);
		expect(wrapper.findAll('button[aria-label^="tool, 30 days:"]')).toHaveLength(1);
		expect(wrapper.findAll('button[aria-label^="tool, 365 days:"]')).toHaveLength(1);
		expect(wrapper.findAll('[style*="height:"]')).toHaveLength(3);
		expect(wrapper.text()).toContain('1,000');
		expect(wrapper.text()).toContain('last 365 days');
		expect(wrapper.text()).not.toContain('Explicitly requested');
		expect(wrapper.find('details').exists()).toBe(false);
		await wrapper.get('button[aria-label^="tool, 30 days:"]').trigger('click');
		expect(wrapper.get('[role="tooltip"]').text()).toContain('100');
		await wrapper.get('button[aria-label^="tool, 30 days:"]').trigger('keydown', { key: 'Escape' });
		expect(wrapper.find('[role="tooltip"]').exists()).toBe(false);
		expect(wrapper.get('a[href="https://docs.brew.sh/Analytics"]').element.closest('[role="dialog"]')).not.toBeNull();
		wrapper.unmount();
	});
	it('aligns categories on one scale and does not add rolling totals or backfill auxiliary metrics', () => {
		const chart = analyticsChart(analytics);
		expect(chart.categories).toEqual(['tool', 'tool --HEAD']);
		expect(chart.maximum).toBe(1000);
		expect(chart.latest?.total).toBe(1000);
		expect(chart.latest?.requested).toBeUndefined();
		expect(analyticsChart({ install: { '90d': { a: 0, b: 0 } } }).maximum).toBe(0);
		expect(analyticsChart({ install: { '90d': { a: 0, b: 0 } } }).latest?.range).toBe('90d');
	});
	it('keeps zero bars finite and supports interactive help links with keyboard focus', async () => {
		const wrapper = mount(PackageStatistics, { props: { analytics: { install: { '90d': { tool: 0, other: 1 } } } }, attachTo: document.body });
		expect(wrapper.html()).not.toContain('NaN');
		const help = wrapper.get('button[aria-haspopup="dialog"]');
		await help.trigger('focus');
		expect(help.attributes('aria-expanded')).toBe('true');
		const link = wrapper.get('a[href="https://docs.brew.sh/Analytics"]');
		await help.trigger('blur', { relatedTarget: link.element });
		expect(help.attributes('aria-expanded')).toBe('true');
		await link.trigger('focusout', { relatedTarget: document.body });
		expect(help.attributes('aria-expanded')).toBe('false');
		wrapper.unmount();
	});
	it('defaults to the top five and replaces the oldest selection while preserving total and colors', async () => {
		const installs = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`option-${index}`, index + 1]));
		const wrapper = mount(PackageStatistics, { props: { analytics: { install: { '365d': installs } } } });
		expect(wrapper.findAll('button[aria-pressed="true"]')).toHaveLength(5);
		expect(wrapper.findAll('button[aria-label^="option-"]')).toHaveLength(5);
		expect(wrapper.get('button[title="option-7"]').attributes('aria-pressed')).toBe('true');
		expect(wrapper.get('button[title="option-0"]').attributes('aria-pressed')).toBe('false');
		await wrapper.get('button[title="option-0"]').trigger('click');
		expect(wrapper.get('button[title="option-0"]').attributes('aria-pressed')).toBe('true');
		expect(wrapper.get('button[title="option-7"]').attributes('aria-pressed')).toBe('false');
		expect(wrapper.findAll('button[aria-label^="option-"]')).toHaveLength(5);
		expect(wrapper.text()).toContain('36');
		await wrapper.get('button[title="option-0"]').trigger('click');
		expect(wrapper.findAll('button[aria-label^="option-"]')).toHaveLength(4);
		wrapper.unmount();
	});
	it('hides missing or invalid analytics instead of treating them as zero', () => {
		for (const analytics of [undefined, {}, { install: { '30d': { tool: -1 } } }]) {
			const wrapper = mount(PackageStatistics, { props: { analytics } });
			expect(wrapper.find('section').exists()).toBe(false);
			expect(wrapper.find('button').exists()).toBe(false);
			wrapper.unmount();
		}
	});
	it('shows the placeholder when valid installation totals are zero', () => {
		const wrapper = mount(PackageStatistics, { props: { analytics: { install: { '30d': { tool: 0 }, '365d': { tool: 0 } } } } });
		expect(wrapper.text()).toContain('No statistics available');
		expect(wrapper.find('button[aria-haspopup="dialog"]').exists()).toBe(true);
		expect(wrapper.find('a[href="https://docs.brew.sh/Analytics"]').exists()).toBe(true);
		expect(wrapper.find('button[aria-pressed]').exists()).toBe(false);
		wrapper.unmount();
	});
});
