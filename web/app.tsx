import { computed, defineComponent, onBeforeUnmount, onMounted, ref } from 'vue';
import { ArrowUpRight, CodeXml, Globe, Moon } from '@lucide/vue';
import SelectMenu from './components/catalog/select-menu';
import { NuxtLink, NuxtPage } from '#components';
import { useCatalogLocale } from './composables/locale';
import { config, withBase } from './lib/config';

export default defineComponent({
	setup() {
		const { locale, t, localPath, alternatePath, barePath } = useCatalogLocale();
		const theme = ref('system');
		let media: MediaQueryList;
		const applyTheme = () => {
			document.documentElement.dataset.theme = theme.value === 'system' ? (media.matches ? 'dark' : 'light') : theme.value;
		};
		onMounted(() => {
			media = matchMedia('(prefers-color-scheme: dark)');
			try {
				theme.value = localStorage.getItem('tap-theme') || 'system';
			} catch {
				/* Storage can be disabled. */
			}
			applyTheme();
			media.addEventListener('change', applyTheme);
		});
		onBeforeUnmount(() => media?.removeEventListener('change', applyTheme));
		const canonical = computed(() => `${config.site.origin}${withBase(localPath(barePath.value))}`);
		useHead(() => ({
			htmlAttrs: { lang: locale.value },
			link: [
				{ rel: 'canonical', href: canonical.value },
				...config.i18n.locales.map((language) => ({
					rel: 'alternate' as const,
					type: 'text/html',
					hreflang: language,
					href: `${config.site.origin}${withBase(language === config.i18n.defaultLocale ? barePath.value : `/${language}${barePath.value}`)}`,
				})),
			],
		}));
		function changeTheme(value: string) {
			theme.value = value;
			try {
				localStorage.setItem('tap-theme', theme.value);
			} catch {
				/* Preference remains in memory. */
			}
			applyTheme();
		}
		return () => (
			<div class="site-shell">
				<a class="skip-link" href="#main">
					{locale.value === 'en' ? 'Skip to content' : '跳转到正文'}
				</a>
				<header class="site-header">
					<NuxtLink class="brand" to={localPath('/')} aria-label={`${config.brand.name} ${t('nav.home')}`}>
						<img class="brand-mark" src={withBase('/homebrew.svg')} alt="Homebrew" width="32" height="32" />
						<span>
							{config.brand.name}
							<span class="brand-suffix"> / tap</span>
						</span>
					</NuxtLink>
					<div class="header-actions">
						<NuxtLink to={alternatePath.value} class="icon-link language-link" aria-label={t('nav.language')}>
							<Globe size={18} stroke-width={1.75} aria-hidden="true" />
							<span>{locale.value === 'en' ? '中文' : 'EN'}</span>
						</NuxtLink>
						<SelectMenu
							class="theme-menu"
							label={t('nav.theme')}
							modelValue={theme.value}
							onUpdate:modelValue={changeTheme}
							options={['system', 'light', 'dark'].map((value) => ({ value, label: t(`theme.${value}`) }))}
							iconOnly>
							<Moon size={18} stroke-width={1.75} aria-hidden="true" />
						</SelectMenu>
						<a class="icon-link github-link" href={config.repository} aria-label={t('nav.github')}>
							<CodeXml size={18} stroke-width={1.75} aria-hidden="true" />
						</a>
					</div>
				</header>
				<main id="main">
					<NuxtPage pageKey={(route) => route.path} />
				</main>
				<footer class="site-footer">
					<div>
						<span class="footer-brand">
							<img src={withBase('/homebrew.svg')} alt="" width="20" height="20" /> {config.brand.name} / tap
						</span>
					</div>
					<div class="footer-right">
						<div>
							<a href={withBase('/api/formula.json')}>
								{t('footer.api')} <ArrowUpRight size={12} />
							</a>
							<a href={config.repository}>
								{t('footer.source')} <ArrowUpRight size={12} />
							</a>
						</div>
						<p>{t('footer.disclaimer')}</p>
					</div>
				</footer>
			</div>
		);
	},
});
