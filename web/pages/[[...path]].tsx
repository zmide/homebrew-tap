import { computed, defineComponent } from 'vue';
import PackageBrowser from '../components/catalog/package-browser';
import PackageDetail from '../components/catalog/package-detail';
import { useCatalogLocale } from '../composables/locale';
import { config } from '../lib/config';
import type { PackageKind } from '../lib/homebrew/types';
import { demo, index, loadPackage, declarations } from '#catalog-data';

export default defineComponent({
	name: 'CatalogPage',
	async setup() {
		const { t, barePath } = useCatalogLocale();
		const segments = barePath.value.split('/').filter(Boolean);
		const kind = segments[0] as PackageKind | undefined;
		const name = segments[1] ? decodeURIComponent(segments[1]) : undefined;
		if (segments.length > 2 || (kind && !['formula', 'cask'].includes(kind))) throw createError({ statusCode: 404, statusMessage: 'Package not found' });
		const detail = Boolean(name);
		const entry = name ? index.find((item) => item.kind === kind && item.name === name) : undefined;
		if (detail && !entry) throw createError({ statusCode: 404, statusMessage: 'Package not found' });
		const title = computed(() => `${name || (kind ? t(`catalog.${kind}`) : config.brand.name + ' / tap')} — ${config.brand.name}`);
		useSeoMeta({
			title,
			robots: demo ? 'noindex, nofollow' : undefined,
			description: () => entry?.desc || config.brand.description,
			ogTitle: title,
			ogDescription: () => entry?.desc || config.brand.description,
			ogType: 'website',
		});
		const { data: item } = await useAsyncData(`package:${kind || 'all'}:${name || 'index'}`, async () => {
			if (!name) return null;
			const value = await loadPackage(kind!, name);
			if (!value) throw createError({ statusCode: 404 });
			return value;
		});
		return () => (
			<>
				{demo ? (
					<div class="demo-notice" role="note">
						{barePath.value && t('detail.demoNotice')}
					</div>
				) : null}
				{detail && item.value ? (
					<div class="detail-page">
						<PackageDetail
							kind={kind!}
							item={item.value}
							demo={demo}
							support={declarations[`${kind}:${name}`]}
							updatedAt={entry?.updatedAt || undefined}
							links={
								demo
									? { repository: 'https://example.com/demo/source', releases: 'https://example.com/demo/releases' }
									: config.links?.[`${kind}:${entry?.fullName}`]
							}
						/>
					</div>
				) : (
					<PackageBrowser entries={index} kind={kind} />
				)}
			</>
		);
	},
});
