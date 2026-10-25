import { defineComponent, h } from 'vue';

// Unit tests only need NuxtLink's rendered anchor, not Nuxt's app/router runtime.
export const NuxtLink = defineComponent({
	props: { to: { type: String, required: true } },
	setup:
		(props, { slots }) =>
		() =>
			h('a', { href: props.to }, slots.default?.()),
});
