import { createInstance } from 'i18next';
import I18NextVue from 'i18next-vue';
import en from '../locales/en/common.json';
import zh from '../locales/zh-CN/common.json';
import enDetail from '../locales/en/detail.json';
import zhDetail from '../locales/zh-CN/detail.json';
import { config } from '../lib/config';

export default defineNuxtPlugin(async (nuxtApp) => {
	const instance = createInstance();
	const path = nuxtApp.$router.currentRoute.value.path;
	const language =
		config.i18n.locales.find((locale) => locale !== config.i18n.defaultLocale && (path.startsWith(`/${locale}/`) || path === `/${locale}`)) || config.i18n.defaultLocale;
	await instance.init({
		lng: language,
		fallbackLng: 'en',
		resources: { en: { translation: { ...en, detail: enDetail } }, 'zh-CN': { translation: { ...zh, detail: zhDetail } } },
		interpolation: { escapeValue: false },
	});
	nuxtApp.vueApp.use(I18NextVue, { i18next: instance });
	return { provide: { i18n: instance } };
});
