import { computed, defineComponent, onBeforeUnmount, onMounted, ref, watch, type PropType } from 'vue';
import { ArrowDownWideNarrow, ArrowRight, ArrowUpRight, Box, Command, Package, Search, X } from '@lucide/vue';
import { NuxtLink } from '#components';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useCatalogLocale } from '../../composables/locale';
import { config } from '../../lib/config';
import { searchPackages, type CatalogEntry } from '../../lib/search';
import CopyCommand from './copy-command';
import SelectMenu from './select-menu';

export default defineComponent({
	name: 'PackageBrowser',
	props: {
		entries: { type: Array as PropType<CatalogEntry[]>, required: true },
		kind: { type: String as PropType<'formula' | 'cask'>, default: undefined },
	},
	setup(props) {
		const { locale, t, localPath } = useCatalogLocale();
		const route = useRoute();
		const router = useRouter();
		const first = (value: unknown) => (typeof value === 'string' ? value : '');
		const query = ref(first(route.query.q));
		const filter = ref(props.kind || (['formula', 'cask'].includes(first(route.query.type)) ? first(route.query.type) : 'all'));
		const sort = ref(route.query.sort === 'name' ? 'name' : 'updated');
		const searchRoot = ref<HTMLElement>();
		const searching = computed(() => Boolean(query.value.trim()) || filter.value !== 'all' || sort.value !== 'updated');
		const matches = computed(() => searchPackages(props.entries, query.value, props.kind || filter.value, sort.value));
		const visible = computed(() => (props.kind || searching.value ? matches.value : matches.value.slice(0, config.recentLimit)));
		watch(
			() => route.query,
			(value) => {
				query.value = first(value.q);
				filter.value = props.kind || (['formula', 'cask'].includes(first(value.type)) ? first(value.type) : 'all');
				sort.value = value.sort === 'name' ? 'name' : 'updated';
			},
		);
		watch([query, filter, sort], () => {
			const next = {
				...route.query,
				q: query.value || undefined,
				type: props.kind || filter.value === 'all' ? undefined : filter.value,
				sort: sort.value === 'updated' ? undefined : sort.value,
			};
			if (JSON.stringify(next) !== JSON.stringify(route.query)) void router.replace({ query: next });
		});
		function shortcut(event: KeyboardEvent) {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
				event.preventDefault();
				searchRoot.value?.querySelector('input')?.focus();
			}
		}
		onMounted(() => window.addEventListener('keydown', shortcut));
		onBeforeUnmount(() => window.removeEventListener('keydown', shortcut));
		function clear() {
			query.value = '';
			filter.value = props.kind || 'all';
			sort.value = 'updated';
		}
		function searchKey(event: KeyboardEvent) {
			if (event.key === 'Escape') {
				query.value = '';
				(event.target as HTMLInputElement).blur();
			}
			if (event.key === 'ArrowDown' || event.key === 'Enter') {
				event.preventDefault();
				document.querySelector<HTMLAnchorElement>('.package-row')?.focus();
			}
		}
		function resultKey(event: KeyboardEvent) {
			if (!['ArrowDown', 'ArrowUp', 'Escape'].includes(event.key)) return;
			event.preventDefault();
			if (event.key === 'Escape') {
				searchRoot.value?.querySelector('input')?.focus();
				return;
			}
			const links = [...document.querySelectorAll<HTMLAnchorElement>('.package-row')];
			const position = links.indexOf(event.currentTarget as HTMLAnchorElement);
			links[(position + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length]?.focus();
		}
		return () => (
			<div class={['catalog-page', { 'is-home': !props.kind }]}>
				<section class="hero">
					{props.kind && <div class="eyebrow">{config.tap}</div>}
					<h1>{props.kind ? t(`catalog.${props.kind}`) : config.brand.title}</h1>
					<p class="hero-description">
						{props.kind ? t(`catalog.${props.kind}Description`) : locale.value === 'zh-CN' ? config.brand.descriptionZh : config.brand.description}
					</p>
					<div class="search-box" ref={searchRoot}>
						<Search size={20} />
						<Input
							id="catalog-search"
							aria-label={t('catalog.searchLabel')}
							placeholder={t('catalog.search')}
							modelValue={query.value}
							onUpdate:modelValue={(value: string) => {
								query.value = value;
							}}
							onKeydown={searchKey}
							type="search"
							autocomplete="off"
						/>
						{query.value ? (
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={t('catalog.clear')}
								onClick={() => {
									query.value = '';
								}}>
								<X size={15} />
							</Button>
						) : (
							<kbd>
								<Command size={12} /> K
							</kbd>
						)}
					</div>
				</section>
				<section class="results-section" aria-label={t('catalog.all')}>
					<div class="catalog-toolbar">
						<div class="filter-tabs" role="group" aria-label={t('catalog.type')}>
							{(props.kind ? [props.kind] : ['all', 'formula', 'cask']).map((kind) => (
								<button
									type="button"
									class={{ selected: filter.value === kind }}
									aria-pressed={filter.value === kind}
									onClick={() => {
										filter.value = kind;
									}}>
									{t(`catalog.${kind}`)}
									<span>{props.entries.filter((entry) => kind === 'all' || entry.kind === kind).length}</span>
								</button>
							))}
						</div>
						<div class="sort-control">
							<ArrowDownWideNarrow size={14} />
							<span class="sr-only">{t('catalog.sort')}</span>
							<SelectMenu
								label={t('catalog.sort')}
								modelValue={sort.value}
								onUpdate:modelValue={(value: string) => {
									sort.value = value;
								}}
								options={['updated', 'name'].map((value) => ({ value, label: t(`catalog.${value}`) }))}
							/>
						</div>
					</div>
					<div class="results-heading">
						<h2>{!props.kind && !searching.value ? t('home.recent') : query.value.trim() ? t('catalog.searchResults') : t('catalog.all')}</h2>
						<span role="status" aria-live="polite">
							{t('catalog.results', { count: matches.value.length })}
						</span>
					</div>
					<div class="package-list">
						{visible.value.map((entry) => (
							<NuxtLink
								to={localPath(`/${entry.kind}/${encodeURIComponent(entry.name)}/`)}
								class="package-row"
								onKeydown={resultKey}
								key={`${entry.kind}:${entry.fullName}`}>
								<span class={['package-icon', entry.kind]}>{entry.kind === 'formula' ? <Package size={22} /> : <Box size={22} />}</span>
								<div class="package-info">
									<div class="package-title">
										<span>{entry.name}</span>
										<Badge variant="secondary">{entry.kind === 'formula' ? 'Formula' : 'Cask'}</Badge>
									</div>
									<p>{entry.desc || entry.displayName}</p>
								</div>
								<div class="package-meta">
									<code>{entry.version}</code>
									{entry.updatedAt && (
										<time datetime={entry.updatedAt} title={t('catalog.updatedLabel')}>
											{new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
												new Date(entry.updatedAt),
											)}
										</time>
									)}
								</div>
								<ArrowUpRight class="row-arrow" size={17} />
							</NuxtLink>
						))}
					</div>
					{!visible.value.length && (
						<div class="empty-state">
							<Search size={28} />
							<h3>{t('catalog.empty')}</h3>
							<p>{props.entries.some((entry) => !props.kind || entry.kind === props.kind) ? t('catalog.emptyDescription') : t('catalog.emptyTap')}</p>
							{searching.value && (
								<Button variant="outline" onClick={clear}>
									{t('catalog.clear')}
								</Button>
							)}
						</div>
					)}
					{!props.kind && !searching.value && matches.value.length > config.recentLimit && (
						<Button
							variant="ghost"
							class="browse-all"
							onClick={() => {
								sort.value = 'name';
							}}>
							{t('home.browse')} <ArrowRight size={14} />
						</Button>
					)}
				</section>
				{!props.kind && (
					<aside class="tap-banner">
						<div>
							<h2>{t('home.tap')}</h2>
							<p>{t('home.tapHint')}</p>
						</div>
						<CopyCommand command={`brew tap ${config.tap}`} />
					</aside>
				)}
			</div>
		);
	},
});
