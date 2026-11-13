import { computed, defineComponent } from 'vue';
import PackageBrowser from '../components/catalog/package-browser';
import PackageDetail from '../components/catalog/package-detail';
import { useCatalogLocale } from '../composables/locale';
import { config } from '../lib/config';
import { index, visibleIndex, loadPackage } from '../lib/catalog-data';
import { parsePackageRoute, versionedPackage } from '../../shared/homebrew-package-routes.mjs';
import { isRecord } from '../lib/homebrew/helpers';

export default defineComponent({
	name: 'CatalogPage',
	async setup() {
		const { t, barePath } = useCatalogLocale();
		const parsed = parsePackageRoute(barePath.value);
		if (!parsed) throw createError({ statusCode: 404, statusMessage: 'Package not found' });
		const { kind, name } = parsed;
		const detail = Boolean(name);
		const entry = name ? index.find((item) => item.kind === kind && item.name === name) : undefined;
		if (detail && !entry) throw createError({ statusCode: 404, statusMessage: 'Package not found' });
		const title = computed(() => `${name || (kind ? t(`catalog.${kind}`) : config.brand.name + ' / tap')} — ${config.brand.name}`);
		useSeoMeta({
			title,
			description: () => entry?.desc || config.brand.description,
			ogTitle: title,
			ogDescription: () => entry?.desc || config.brand.description,
			ogType: 'website',
			robots: name && versionedPackage(name) ? 'noindex,follow' : undefined,
		});
		const { data: item } = await useAsyncData(`package:${kind || 'all'}:${name || 'index'}`, async () => {
			if (!name) return null;
			const value = await loadPackage(kind!, name);
			if (!value) throw createError({ statusCode: 404 });
			const fixed = versionedPackage(name);
			const actual = kind === 'cask' ? value.version : isRecord(value.versions) ? value.versions.stable : undefined;
			if (fixed?.fixed && actual !== fixed.version) throw createError({ statusCode: 404, statusMessage: 'Fixed version mismatch' });
			return value;
		});
		return () => (
			<>
				{detail && item.value ? (
					<div class="detail-page">
						<PackageDetail kind={kind!} item={item.value} updatedAt={entry?.updatedAt || undefined} links={config.links?.[`${kind}:${entry?.fullName}`]} />
					</div>
				) : (
					<PackageBrowser entries={visibleIndex} kind={kind} />
				)}
			</>
		);
	},
});
