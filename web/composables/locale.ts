import { computed } from 'vue';
import { config, localizedPath, type Locale } from '../lib/config';

export function useCatalogLocale() {
	const route = useRoute();
	const { $i18n } = useNuxtApp();
	const locale = computed<Locale>(
		() =>
			(config.i18n.locales.find((language) => language !== config.i18n.defaultLocale && (route.path.startsWith(`/${language}/`) || route.path === `/${language}`)) ||
				config.i18n.defaultLocale) as Locale,
	);
	const t = (key: string, variables: Record<string, unknown> = {}): string => String($i18n.t(key, { ...variables, lng: locale.value }));
	const localPath = (path: string) => localizedPath(path, locale.value);
	const barePath = computed(() => (locale.value === config.i18n.defaultLocale ? route.path : route.path.slice(locale.value.length + 1) || '/'));
	const alternatePath = computed(() => ({ path: localizedPath(barePath.value, locale.value === 'en' ? 'zh-CN' : 'en'), query: route.query }));
	return { locale, t, localPath, barePath, alternatePath, config };
}
