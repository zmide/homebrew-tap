import { defineComponent } from 'vue';
import { useCatalogLocale } from './composables/locale';
import { withBase } from './lib/config';

export default defineComponent({
	setup() {
		const { locale, t, localPath } = useCatalogLocale();
		useHead(() => ({ htmlAttrs: { lang: locale.value } }));
		return () => (
			<main class="error-page">
				<span class="eyebrow">404</span>
				<h1>{t('error.title')}</h1>
				<p>{t('error.description')}</p>
				<a class="back-link" href={withBase(localPath('/'))}>
					<span aria-hidden="true">←</span> {t('error.back')}
				</a>
			</main>
		);
	},
});
