import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import CopyCommand from '../components/catalog/copy-command';

vi.mock('../composables/locale', () => ({
	useCatalogLocale: () => ({
		t: (key: string) =>
			({
				'copy.copy': 'Copy command',
				'copy.copied': 'Copied!',
				'copy.failed': 'Could not copy. Select and copy the command manually.',
			})[key] ?? key,
	}),
}));

// Exercise CopyCommand's behavior, not the vendored Tile UI implementation.
vi.mock('../components/ui/button', async () => {
	const { defineComponent, h } = await import('vue');
	return {
		Button: defineComponent({
			inheritAttrs: false,
			props: ['variant', 'size'],
			setup:
				(_, { attrs, slots }) =>
				() =>
					h('button', { ...attrs, type: 'button' }, slots.default?.()),
		}),
	};
});

describe('CopyCommand', () => {
	const command = 'brew install example/tools/native@2';
	const writeText = vi.fn<(text: string) => Promise<void>>();
	let wrapper: VueWrapper | undefined;

	beforeEach(() => {
		vi.useFakeTimers();
		writeText.mockReset().mockResolvedValue(undefined);
		vi.stubGlobal('navigator', { clipboard: { writeText } });
	});

	afterEach(() => {
		wrapper?.unmount();
		wrapper = undefined;
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	function render(value = command) {
		wrapper = mount(CopyCommand, { props: { command: value } });
		return wrapper;
	}

	it('renders selectable command text and an accessible idle button', () => {
		const component = render();
		expect(component.get('code').text()).toBe(command);
		expect(component.get('.prompt').attributes('aria-hidden')).toBe('true');
		expect(component.get('button').attributes('aria-label')).toBe('Copy command');
		expect(component.get('[role="status"]').text()).toBe('');
		expect(writeText).not.toHaveBeenCalled();
	});

	it('copies exactly the command, without the decorative shell prompt', async () => {
		const component = render();
		await component.get('button').trigger('click');
		await flushPromises();
		expect(writeText).toHaveBeenCalledExactlyOnceWith(command);
		expect(component.get('[role="status"]').text()).toBe('Copied!');
		expect(component.get('button').attributes('aria-label')).toBe('Copied!');
		expect(component.get('.copy-feedback').classes()).not.toContain('is-error');
	});

	it('does not report success before the clipboard promise resolves', async () => {
		let finish!: () => void;
		writeText.mockReturnValueOnce(
			new Promise<void>((resolve) => {
				finish = resolve;
			}),
		);
		const component = render();
		await component.get('button').trigger('click');
		expect(component.get('[role="status"]').text()).toBe('');
		finish();
		await flushPromises();
		expect(component.get('[role="status"]').text()).toBe('Copied!');
	});

	it('shows actionable failure feedback when clipboard permission is denied', async () => {
		writeText.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'));
		const component = render();
		await component.get('button').trigger('click');
		await flushPromises();
		expect(component.get('[role="status"]').text()).toBe('Could not copy. Select and copy the command manually.');
		expect(component.get('.copy-feedback').classes()).toContain('is-error');
		expect(component.get('code').text()).toBe(command);
		expect(component.get('button').attributes('aria-label')).toBe('Copy command');
	});

	it('handles browsers with no clipboard API without an uncaught error', async () => {
		vi.stubGlobal('navigator', {});
		const component = render();
		await component.get('button').trigger('click');
		await flushPromises();
		expect(component.get('.copy-feedback').classes()).toContain('is-error');
		expect(component.get('[role="status"]').text()).toContain('copy the command manually');
	});

	it('returns to idle after 2.5 seconds, resetting the timeout for repeated copies', async () => {
		const component = render();
		await component.get('button').trigger('click');
		await flushPromises();
		await vi.advanceTimersByTimeAsync(2000);
		await component.get('button').trigger('click');
		await flushPromises();
		await vi.advanceTimersByTimeAsync(500);
		expect(component.get('[role="status"]').text()).toBe('Copied!');
		await vi.advanceTimersByTimeAsync(1999);
		expect(component.get('[role="status"]').text()).toBe('Copied!');
		await vi.advanceTimersByTimeAsync(1);
		expect(component.get('[role="status"]').text()).toBe('');
		expect(component.get('button').attributes('aria-label')).toBe('Copy command');
	});

	it('can recover from a failed copy and uses the current command prop', async () => {
		writeText.mockRejectedValueOnce(new Error('Clipboard unavailable'));
		const component = render();
		await component.get('button').trigger('click');
		await flushPromises();
		await component.setProps({ command: 'brew tap example/tools' });
		await component.get('button').trigger('click');
		await flushPromises();
		expect(writeText).toHaveBeenLastCalledWith('brew tap example/tools');
		expect(component.get('[role="status"]').text()).toBe('Copied!');
		expect(component.get('.copy-feedback').classes()).not.toContain('is-error');
	});

	it('clears pending feedback timers when unmounted', async () => {
		const component = render();
		await component.get('button').trigger('click');
		await flushPromises();
		expect(vi.getTimerCount()).toBe(1);
		component.unmount();
		wrapper = undefined;
		expect(vi.getTimerCount()).toBe(0);
	});
});
