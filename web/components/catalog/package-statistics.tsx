import { computed, defineComponent, ref, onMounted, onBeforeUnmount, nextTick, useId, watch } from 'vue';
import { Download, TriangleAlert } from '@lucide/vue';
import HelpTip from './help-tip';
import { useCatalogLocale } from '@/composables/locale';
import { analyticsChart } from '@/lib/homebrew/analytics';
import styles from '@/lib/homebrew/package-detail.module.scss';

const colors = ['#4285b4', '#d18b32', '#3a9b7a', '#c76675', '#8873bc', '#8c9545', '#bd7446', '#609caa'];
export default defineComponent({
	name: 'PackageStatistics',
	props: { analytics: { type: null, required: false } },
	setup(props) {
		const { t, locale } = useCatalogLocale();
		const chart = computed(() => analyticsChart(props.analytics));
		const selected = ref<string[]>([]);
		const ranked = computed(() => {
			const { categories, latest } = chart.value;
			const counts = new Map(latest?.installs.map((entry) => [entry.name, entry.count]));
			return [...categories].sort((a, b) => (counts.get(b) ?? -1) - (counts.get(a) ?? -1) || a.localeCompare(b));
		});
		watch(chart, () => {
			selected.value = ranked.value.slice(0, 5);
			active.value = undefined;
		});
		selected.value = ranked.value.slice(0, 5);
		const active = ref<{ key: string; name: string; range: string; count: number }>();
		const root = ref<HTMLElement>();
		const panel = ref<HTMLElement>();
		const id = useId();
		const close = () => {
			active.value = undefined;
		};
		const outside = (event: PointerEvent) => {
			if (!root.value?.contains(event.target as Node)) close();
		};
		const position = (x: number, y: number) => {
			if (!panel.value) return;
			const box = panel.value.getBoundingClientRect();
			const left = x + 12 + box.width <= window.innerWidth - 8 ? x + 12 : x - box.width - 12;
			const top = y + 12 + box.height <= window.innerHeight - 8 ? y + 12 : y - box.height - 12;
			panel.value.style.left = `${Math.max(8, Math.min(left, window.innerWidth - box.width - 8))}px`;
			panel.value.style.top = `${Math.max(8, Math.min(top, window.innerHeight - box.height - 8))}px`;
		};
		const show = async (event: Event, value: NonNullable<typeof active.value>) => {
			const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
			const pointer = 'clientX' in event && (event as PointerEvent).pointerType !== 'touch';
			const x = pointer ? (event as MouseEvent).clientX : rect.left + rect.width / 2;
			const y = pointer ? (event as MouseEvent).clientY : rect.top;
			active.value = value;
			await nextTick();
			if (active.value?.key === value.key) position(x, y);
		};
		onMounted(() => {
			document.addEventListener('pointerdown', outside);
			window.addEventListener('scroll', close, true);
			window.addEventListener('resize', close);
		});
		onBeforeUnmount(() => {
			document.removeEventListener('pointerdown', outside);
			window.removeEventListener('scroll', close, true);
			window.removeEventListener('resize', close);
		});
		const number = (value: number) => new Intl.NumberFormat(locale.value).format(value);
		const rangeLabel = (range: string) => t('detail.statisticsDays', { count: Number.parseInt(range) });
		const color = (index: number) => colors[index] ?? `hsl(${Math.round(index * 137.508) % 360} 48% 52%)`;
		const toggle = (name: string) => {
			close();
			if (selected.value.includes(name)) selected.value = selected.value.filter((entry) => entry !== name);
			else selected.value = [...selected.value.slice(selected.value.length >= 5 ? 1 : 0), name];
		};
		return () => {
			const { windows, categories, latest } = chart.value;
			if (!latest) return null;
			if (windows.every((window) => window.total === 0))
				return (
					<section class={[styles.section, styles.statistics]} aria-label={t('detail.statistics')}>
						<h2>
							<span class={styles.helpLabel}>
								<span>{t('detail.statistics')}</span>
								<HelpTip
									label={`${t('detail.helpAbout')} ${t('detail.statistics')}`}
									text={t('detail.statisticsHelp')}
									link="https://docs.brew.sh/Analytics"
									linkLabel={t('detail.statisticsSource')}
								/>
							</span>
						</h2>
						<p class={[styles.muted, styles.statEmpty]}>
							<Download size={16} stroke-width={1.5} aria-hidden="true" />
							{t('detail.statisticsEmpty')}
						</p>
					</section>
				);
			const visible = categories.filter((name) => selected.value.includes(name));
			const maximum = Math.max(0, ...windows.flatMap((window) => window.installs.filter((entry) => selected.value.includes(entry.name)).map((entry) => entry.count)));
			return (
				<section ref={root} class={[styles.section, styles.statistics]} aria-label={t('detail.statistics')}>
					<h2>
						<span class={styles.helpLabel}>
							<span>{t('detail.statistics')}</span>
							<HelpTip
								label={`${t('detail.helpAbout')} ${t('detail.statistics')}`}
								text={t('detail.statisticsHelp')}
								link="https://docs.brew.sh/Analytics"
								linkLabel={t('detail.statisticsSource')}
							/>
						</span>
					</h2>
					<div class={styles.statSummary}>
						<p class={styles.downloadCount}>
							<Download size={28} stroke-width={1.5} aria-hidden="true" />
							{number(latest.total)}
						</p>
						<p class={styles.muted}>{t('detail.statisticsScope', { count: Number.parseInt(latest.range) })}</p>
					</div>
					<div class={styles.chartScroll} tabindex="0" role="region" aria-label={t('detail.statisticsBreakdown')}>
						<div class={styles.chartGroups} style={{ minWidth: `${windows.length * Math.max(60, visible.length * 14 + 8)}px` }}>
							{windows.map((window) => (
								<div key={window.range} class={styles.chartGroup}>
									<div class={styles.chartColumns}>
										{visible.map((name) => {
											const index = categories.indexOf(name);
											const entry = window.installs.find((entry) => entry.name === name);
											const value = entry ? { key: `${window.range}:${name}`, name, range: window.range, count: entry.count } : undefined;
											return value ? (
												<button
													key={name}
													type="button"
													class={styles.chartSlot}
													aria-label={`${name}, ${rangeLabel(window.range)}: ${number(value.count)}`}
													aria-describedby={active.value?.key === value.key ? id : undefined}
													onPointerenter={(event) => {
														if (event.pointerType !== 'touch') void show(event, value);
													}}
													onPointerleave={close}
													onPointermove={(event) => {
														if (event.pointerType !== 'touch' && active.value?.key === value.key) position(event.clientX, event.clientY);
													}}
													onFocus={(event) => {
														if ((event.target as HTMLElement).matches(':focus-visible')) void show(event, value);
													}}
													onBlur={close}
													onKeydown={(event) => {
														if (event.key === 'Escape') close();
													}}
													onClick={(event) => {
														if (active.value?.key === value.key) close();
														else void show(event, value);
													}}>
													<span
														class={styles.chartBar}
														style={{ height: `${maximum ? (value.count / maximum) * 100 : 0}%`, background: color(index) }}
														aria-hidden="true"
													/>
												</button>
											) : (
												<span class={styles.chartSlot} key={name} aria-hidden="true" />
											);
										})}
									</div>
									<span>{rangeLabel(window.range)}</span>
								</div>
							))}
						</div>
					</div>
					{active.value ? (
						<div ref={panel} id={id} class={styles.chartTooltip} role="tooltip">
							<strong>{active.value.name}</strong>
							<span>{rangeLabel(active.value.range)}</span>
							<span class={styles.statValue}>
								<Download size={14} stroke-width={1.5} aria-hidden="true" />
								{number(active.value.count)}
							</span>
						</div>
					) : null}
					<div class={styles.statLegendGroup}>
						<ul class={styles.chartLegend} aria-label={t('detail.statisticsSelection')}>
							{ranked.value.map((name) => (
								<li key={name}>
									<button type="button" aria-pressed={selected.value.includes(name)} onClick={() => toggle(name)} title={name}>
										<span style={{ background: color(categories.indexOf(name)) }} aria-hidden="true" />
										<span>{name}</span>
									</button>
								</li>
							))}
						</ul>
					</div>
					{latest.requested !== undefined || latest.errors !== undefined ? (
						<div class={styles.statAuxiliary}>
							<p class={styles.muted}>{t('detail.statisticsAuxiliary', { count: Number.parseInt(latest.range) })}</p>
							<dl class={styles.facts}>
								{latest.requested !== undefined ? (
									<>
										<dt>{t('detail.statisticsRequested')}</dt>
										<dd>
											<span class={styles.statValue}>
												<Download size={14} stroke-width={1.5} aria-hidden="true" />
												{number(latest.requested)}
											</span>
										</dd>
									</>
								) : null}
								{latest.errors !== undefined ? (
									<>
										<dt>{t('detail.statisticsErrors')}</dt>
										<dd>
											<span class={styles.statValue}>
												<TriangleAlert size={14} stroke-width={1.5} aria-hidden="true" />
												{number(latest.errors)}
											</span>
										</dd>
									</>
								) : null}
							</dl>
						</div>
					) : null}
				</section>
			);
		};
	},
});
