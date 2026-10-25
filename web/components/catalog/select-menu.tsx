import { computed, defineComponent, onBeforeUnmount, onMounted, ref, useId, type PropType } from 'vue';
import { Check, ChevronDown } from '@lucide/vue';

export default defineComponent({
	name: 'SelectMenu',
	props: {
		modelValue: { type: String, required: true },
		label: { type: String, required: true },
		options: { type: Array as PropType<{ value: string; label: string }[]>, required: true },
		iconOnly: Boolean,
	},
	emits: ['update:modelValue'],
	setup(props, { emit, slots }) {
		const id = useId();
		const root = ref<HTMLElement>();
		const trigger = ref<HTMLButtonElement>();
		const open = ref(false);
		const active = ref(0);
		const selected = computed(() => props.options.find((option) => option.value === props.modelValue));
		function show() {
			active.value = Math.max(
				0,
				props.options.findIndex((option) => option.value === props.modelValue),
			);
			open.value = true;
		}
		function choose(index: number) {
			const option = props.options[index];
			if (option) emit('update:modelValue', option.value);
			open.value = false;
			trigger.value?.focus();
		}
		function outside(event: PointerEvent) {
			if (!root.value?.contains(event.target as Node)) open.value = false;
		}
		onMounted(() => document.addEventListener('pointerdown', outside));
		onBeforeUnmount(() => document.removeEventListener('pointerdown', outside));
		function keydown(event: KeyboardEvent) {
			if (event.key === 'Tab') {
				open.value = false;
				return;
			}
			if (event.key === 'Escape') {
				open.value = false;
				event.preventDefault();
				return;
			}
			if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) return;
			event.preventDefault();
			if (!open.value) {
				show();
				return;
			}
			if (event.key === 'Enter' || event.key === ' ') choose(active.value);
			else if (event.key === 'Home') active.value = 0;
			else if (event.key === 'End') active.value = props.options.length - 1;
			else active.value = (active.value + (event.key === 'ArrowDown' ? 1 : -1) + props.options.length) % props.options.length;
		}
		return () => (
			<div
				class={['select-menu', { 'select-icon': props.iconOnly }]}
				ref={root}
				onFocusout={(event) => {
					if (!root.value?.contains(event.relatedTarget as Node)) open.value = false;
				}}>
				<button
					ref={trigger}
					type="button"
					role="combobox"
					aria-label={props.label}
					aria-haspopup="listbox"
					aria-expanded={open.value}
					aria-controls={`${id}-list`}
					aria-activedescendant={open.value ? `${id}-${active.value}` : undefined}
					data-value={props.modelValue}
					onClick={() => (open.value ? (open.value = false) : show())}
					onKeydown={keydown}>
					{slots.default?.()}
					{!props.iconOnly && (
						<>
							<span>{selected.value?.label}</span>
							<ChevronDown size={12} />
						</>
					)}
				</button>
				{open.value && (
					<ul id={`${id}-list`} role="listbox" aria-label={props.label}>
						{props.options.map((option, index) => (
							<li
								id={`${id}-${index}`}
								role="option"
								aria-selected={option.value === props.modelValue}
								class={{ 'is-active': index === active.value }}
								onPointerdown={(event) => event.preventDefault()}
								onPointermove={() => (active.value = index)}
								onClick={() => choose(index)}>
								<span>{option.label}</span>
								{option.value === props.modelValue && <Check size={14} />}
							</li>
						))}
					</ul>
				)}
			</div>
		);
	},
});
