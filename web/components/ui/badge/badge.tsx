import { defineComponent, computed, h, type PropType } from 'vue';
import { getBadgeStyleKeys } from '../lib/core';
import type { BadgeVariant } from '../lib/core';
import styles from './badge.module.scss';

export const Badge = defineComponent({
	name: 'Badge',
	props: {
		variant: {
			type: String as PropType<BadgeVariant>,
			default: 'default',
		},
	},
	setup(props, { slots, attrs }) {
		const styleKeys = computed(() => getBadgeStyleKeys(props.variant));
		const classes = computed(() => [styles[styleKeys.value.base], styles[styleKeys.value.variant], attrs.class]);

		return () => h('span', { ...attrs, class: classes.value }, slots.default?.());
	},
});

export default Badge;
