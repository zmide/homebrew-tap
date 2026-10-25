import { CircleHelp } from '@lucide/vue';
import { defineComponent, onBeforeUnmount, onMounted, ref, useId } from 'vue';
import styles from '@/lib/homebrew/help-tip.module.scss';

export default defineComponent({
	name: 'HelpTip',
	props: { label: { type: String, required: true }, text: { type: String, required: true }, link: String, linkLabel: String },
	setup(props) {
		const root = ref<HTMLElement>();
		const panel = ref<HTMLElement>();
		const open = ref(false);
		let pinned = false;
		let pressedPinned = false;
		const id = useId();
		const position = () => {
			const trigger = root.value?.getBoundingClientRect();
			if (!trigger || !panel.value) return;
			const width = Math.min(300, window.innerWidth - 32);
			panel.value.style.width = `${width}px`;
			panel.value.style.left = `${Math.max(16, Math.min(trigger.left, window.innerWidth - width - 16))}px`;
			const height = panel.value.getBoundingClientRect().height;
			panel.value.style.top = `${trigger.bottom + height + 12 > window.innerHeight ? Math.max(8, trigger.top - height - 8) : trigger.bottom + 8}px`;
		};
		const show = () => {
			open.value = true;
			requestAnimationFrame(position);
		};
		const close = () => {
			open.value = false;
			pinned = false;
		};
		const outside = (event: PointerEvent) => {
			if (!root.value?.contains(event.target as Node)) close();
		};
		const escape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') close();
		};
		onMounted(() => {
			document.addEventListener('pointerdown', outside);
			document.addEventListener('keydown', escape);
			window.addEventListener('resize', close);
			window.addEventListener('scroll', position, true);
		});
		onBeforeUnmount(() => {
			document.removeEventListener('pointerdown', outside);
			document.removeEventListener('keydown', escape);
			window.removeEventListener('resize', close);
			window.removeEventListener('scroll', position, true);
		});
		return () => (
			<span
				ref={root}
				class={styles.help}
				onPointerenter={(event) => {
					if (event.pointerType !== 'touch') show();
				}}
				onPointerleave={(event) => {
					if (event.pointerType !== 'touch' && !pinned) close();
				}}>
				<button
					type="button"
					aria-label={props.label}
					aria-describedby={props.link ? undefined : id}
					aria-controls={props.link ? id : undefined}
					aria-haspopup={props.link ? 'dialog' : undefined}
					aria-expanded={open.value}
					onFocus={show}
					onBlur={(event) => {
						if (!root.value?.contains(event.relatedTarget as Node)) close();
					}}
					onPointerdown={() => {
						pressedPinned = pinned;
					}}
					onClick={() => {
						if (pressedPinned) close();
						else {
							pinned = true;
							show();
						}
					}}>
					<CircleHelp size={13} stroke-width={1.5} aria-hidden="true" />
				</button>
				<span
					ref={panel}
					id={id}
					role={props.link ? 'dialog' : 'tooltip'}
					aria-label={props.link ? props.label : undefined}
					class={[styles.panel, open.value && styles.open]}
					onFocusout={(event) => {
						if (!root.value?.contains(event.relatedTarget as Node)) close();
					}}>
					{props.text}
					{props.link ? (
						<a href={props.link} style={{ display: 'block', marginTop: '0.5rem' }}>
							{props.linkLabel} ↗
						</a>
					) : null}
				</span>
				<noscript>{props.text}</noscript>
			</span>
		);
	},
});
