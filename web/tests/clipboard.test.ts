import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { useClipboardText } from '../composables/clipboard';

const writeText = vi.fn<(text: string) => Promise<void>>();
let wrapper: VueWrapper | undefined;
function render() {
	const text = ref('first');
	let clipboard!: ReturnType<typeof useClipboardText>;
	wrapper = mount(
		defineComponent({
			setup() {
				clipboard = useClipboardText(() => text.value);
				return () => h('span', clipboard.status.value);
			},
		}),
	);
	return { text, ...clipboard };
}

function deferred() {
	let resolve!: () => void;
	let reject!: (reason: Error) => void;
	const promise = new Promise<void>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

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

describe('useClipboardText', () => {
	it('ignores older rejection after the newest copy succeeds', async () => {
		const old = deferred();
		writeText.mockReturnValueOnce(old.promise);
		const clipboard = render();
		const pending = clipboard.copy();
		expect(await clipboard.copy()).toBe(true);
		old.reject(new Error('Old request denied'));
		expect(await pending).toBeUndefined();
		expect(clipboard.status.value).toBe('copied');
		await vi.advanceTimersByTimeAsync(2500);
		expect(clipboard.status.value).toBe('idle');
	});
	it('ignores older success after the newest copy fails', async () => {
		const old = deferred();
		writeText.mockReturnValueOnce(old.promise).mockRejectedValueOnce(new Error('Denied'));
		const clipboard = render();
		const pending = clipboard.copy();
		expect(await clipboard.copy()).toBe(false);
		old.resolve();
		expect(await pending).toBeUndefined();
		expect(clipboard.status.value).toBe('failed');
	});
	it('invalidates pending copies synchronously when text changes', async () => {
		const old = deferred();
		writeText.mockReturnValueOnce(old.promise);
		const clipboard = render();
		const pending = clipboard.copy();
		clipboard.text.value = 'second';
		old.resolve();
		expect(await pending).toBeUndefined();
		expect(clipboard.status.value).toBe('idle');
		expect(vi.getTimerCount()).toBe(0);
		expect(await clipboard.copy()).toBe(true);
		expect(writeText).toHaveBeenLastCalledWith('second');
		clipboard.text.value = 'third';
		expect(clipboard.status.value).toBe('idle');
		expect(vi.getTimerCount()).toBe(0);
	});
	it('does not let an earlier feedback timer cancel a pending request', async () => {
		const clipboard = render();
		await clipboard.copy();
		await vi.advanceTimersByTimeAsync(2000);
		const next = deferred();
		writeText.mockReturnValueOnce(next.promise);
		const pending = clipboard.copy();
		await vi.advanceTimersByTimeAsync(1000);
		expect(clipboard.status.value).toBe('idle');
		next.resolve();
		expect(await pending).toBe(true);
		await vi.advanceTimersByTimeAsync(2499);
		expect(clipboard.status.value).toBe('copied');
		await vi.advanceTimersByTimeAsync(1);
		expect(clipboard.status.value).toBe('idle');
	});
	it('ignores asynchronous completion after unmount and clears timers', async () => {
		const clipboard = render();
		await clipboard.copy();
		expect(vi.getTimerCount()).toBe(1);
		const next = deferred();
		writeText.mockReturnValueOnce(next.promise);
		const pending = clipboard.copy();
		wrapper!.unmount();
		wrapper = undefined;
		next.resolve();
		expect(await pending).toBeUndefined();
		expect(clipboard.status.value).toBe('idle');
		expect(vi.getTimerCount()).toBe(0);
	});
});
