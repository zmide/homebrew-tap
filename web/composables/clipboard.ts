import { onBeforeUnmount, ref, watch } from 'vue';

/** Copy the current text; stale requests must not overwrite newer feedback. */
export function useClipboardText(text: () => string) {
	const status = ref<'idle' | 'copied' | 'failed'>('idle');
	let timer: ReturnType<typeof setTimeout> | undefined;
	let generation = 0;
	let disposed = false;
	function reset() {
		generation++;
		clearTimeout(timer);
		status.value = 'idle';
	}
	watch(text, reset, { flush: 'sync' });
	onBeforeUnmount(() => {
		disposed = true;
		reset();
	});
	async function copy(): Promise<boolean | undefined> {
		reset();
		const request = generation;
		let success = false;
		try {
			await navigator.clipboard.writeText(text());
			success = true;
		} catch {
			// Unavailable APIs, insecure contexts and denied permissions share the fallback.
		}
		if (disposed || request !== generation) return undefined;
		status.value = success ? 'copied' : 'failed';
		timer = setTimeout(reset, 2500);
		return success;
	}
	return { status, copy, reset };
}
