import { defineComponent, type PropType, type VNodeChild } from 'vue';
import CopyCommand from '@/components/catalog/copy-command';
import CodeBlock from '@/components/catalog/code-block';
import PackageInformation from '@/components/catalog/package-information';
import HelpTip from '@/components/catalog/help-tip';
import PlatformSupport from '@/components/catalog/platform-support';
import PackageNotes from '@/components/catalog/package-notes';
import ProjectLinks from '@/components/catalog/project-links';
import PackageStatistics from '@/components/catalog/package-statistics';
import PackageBadge from '@/components/catalog/package-badge';
import { platformSupport, visibleArtifacts, uniqueLinks, dependencyViews, serviceViews } from '@/lib/homebrew/detail-view';
import { platformName } from '@/lib/homebrew/platforms';
import { projectLinks } from '@/lib/homebrew/project-links';
import { useCatalogLocale } from '@/composables/locale';
import { config, withBase } from '@/lib/config';
import {
	apiPath,
	dependencyLink,
	displayName,
	formatValue,
	fullName,
	hasValue,
	installCommand,
	isRecord,
	packageNotices,
	packageName,
	rosettaRequirement,
	safeExternalUrl,
	sourceLink,
	strings,
	text,
} from '@/lib/homebrew/helpers';
import type { Dependency, HomebrewPackage, PackageKind } from '@/lib/homebrew/types';
import type { SupportDeclaration } from '@/lib/homebrew/detail-view';
import type detailLabels from '@/locales/en/detail.json';
import styles from '@/lib/homebrew/package-detail.module.scss';

type DetailLabel = keyof typeof detailLabels;

export default defineComponent({
	name: 'PackageDetail',
	props: {
		kind: { type: String as PropType<PackageKind>, required: true },
		item: { type: Object as PropType<HomebrewPackage>, required: true },
		updatedAt: String,
		demo: Boolean,
		support: Array as PropType<SupportDeclaration[]>,
		links: { type: Object as PropType<{ repository?: string; releases?: string }>, default: () => ({}) },
	},
	setup(props) {
		const { locale, localPath, t } = useCatalogLocale();
		const label = (key: DetailLabel): string => t(`detail.${key}`);
		const external = (href: string, children: VNodeChild) => <a href={href}>{children}</a>;
		const code = (value: unknown) => <CodeBlock code={formatValue(value)} language={typeof value === 'string' ? 'text' : 'json'} />;
		const help = (key: DetailLabel, explanation: DetailLabel) => (
			<span class={styles.helpLabel}>
				<span>{label(key)}</span>
				<HelpTip label={`${label('helpAbout')} ${label(key)}`} text={label(explanation)} />
			</span>
		);
		const section = (title: VNodeChild, children: VNodeChild) => (
			<section class={styles.section}>
				<h2>{title}</h2>
				{children}
			</section>
		);
		const fact = (title: VNodeChild, value: VNodeChild) => (
			<>
				<dt>{title}</dt>
				<dd>{value}</dd>
			</>
		);
		const dependency = (entry: Dependency) => {
			const link = dependencyLink(entry.name, entry.kind, { tap: config.tap, localPath: (path) => withBase(localPath(path)) });
			return (
				<>
					{link ? link.external ? external(link.href, entry.name) : <a href={link.href}>{entry.name}</a> : <code>{entry.name}</code>}
					{entry.detail ? <small>{entry.detail}</small> : null}
				</>
			);
		};
		const date = (value?: string) => {
			if (!value || Number.isNaN(Date.parse(value))) return undefined;
			return new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(value));
		};

		return () => {
			const entry = props.item;
			const isFormula = props.kind === 'formula';

			const services = serviceViews(props.item);
			const platforms = platformSupport(props.kind, props.item, props.support ?? config.platformSupport?.[`${props.kind}:${fullName(props.kind, props.item)}`]);
			const dependencyVariants = dependencyViews(props.kind, props.item);
			const notices = packageNotices(entry);
			const urls = isRecord(entry.urls) ? entry.urls : {};
			const headUrl = isRecord(urls.head) ? urls.head : {};
			const rosetta = rosettaRequirement(entry);
			const artifacts = visibleArtifacts(entry);
			const conflicts = isRecord(entry.conflicts_with) ? Object.values(entry.conflicts_with).flatMap(strings) : strings(entry.conflicts_with);
			const links = projectLinks(entry, props.links);
			const primaryLinks = uniqueLinks([
				{ label: label('homepage'), href: safeExternalUrl(entry.homepage) },
				{ label: label('repository'), href: links.repository },
				{ label: label('releases'), href: links.releases },
			]);
			const moreLinks = uniqueLinks([
				{ label: label('source'), href: sourceLink(props.kind, entry, config.repository) },
				{ label: label('headDownload'), href: isFormula ? safeExternalUrl(headUrl.url) : undefined },

				{
					label: label('api'),
					href: !props.demo && apiPath(props.kind, packageName(props.kind, props.item)) ? withBase(apiPath(props.kind, packageName(props.kind, props.item))!) : undefined,
				},
			]).filter((link) => !primaryLinks.some((primary) => primary.href === link.href));
			const command = installCommand(props.kind, props.item);

			return (
				<article class={styles.detail}>
					<a href={withBase(localPath('/'))} class={styles.breadcrumb}>
						← {label('catalog')}
					</a>
					<header>
						<div class={styles.eyebrow}>
							<span class={styles.tag}>{label(props.kind)}</span>
							<code class={styles.identity}>{fullName(props.kind, entry)}</code>
						</div>
						<div class={styles.title}>
							<h1>{displayName(props.kind, entry)}</h1>
						</div>
						{text(entry.desc) ? <p class={styles.description}>{entry.desc}</p> : null}
						<PackageBadge kind={props.kind} item={props.item} demo={props.demo} />
					</header>

					<div class={styles.layout}>
						{command ? (
							<section class={styles.install}>
								<h2>{label('install')}</h2>
								<p class={styles.muted}>{label('installHint')}</p>
								<CopyCommand command={command} />
							</section>
						) : null}
						<div class={styles.main} data-detail-main>
							{notices.map((notice) => (
								<section class={styles.warning} key={notice.type} aria-label={notice.type === 'disable' ? label('disabled') : label('deprecated')}>
									<h2>
										{notice.type === 'disable'
											? label(notice.scheduled ? 'disableScheduled' : 'disabled')
											: label(notice.scheduled ? 'deprecationScheduled' : 'deprecated')}
									</h2>
									{notice.date ? (
										<p>
											{label('date')}: <time datetime={notice.date}>{date(notice.date)}</time>
										</p>
									) : null}
									{notice.reason ? <p>{notice.reason}</p> : null}
									{notice.replacements.length ? (
										<div class={styles.replacements}>
											{label('replacement')}:{' '}
											{notice.replacements.map((replacement, index) => (
												<span key={`${replacement.kind}:${replacement.name}`}>
													{index ? ', ' : ''}
													{dependency(replacement)}
												</span>
											))}
										</div>
									) : null}
								</section>
							))}

							<PlatformSupport platforms={platforms} rosetta={rosetta === true} />
							{hasValue(entry.caveats) ? section(label('caveats'), <PackageNotes text={entry.caveats as string} />) : null}
							<>
								{isFormula && entry.keg_only === true
									? section(
											help('kegOnly', 'kegOnlyHelp'),
											<>
												<p class={styles.muted}>{label('kegOnlyHint')}</p>
												{isRecord(entry.keg_only_reason) && text(entry.keg_only_reason.explanation) ? (
													<p>{String(entry.keg_only_reason.explanation)}</p>
												) : null}
											</>,
										)
									: null}

								{dependencyVariants.length
									? section(
											label('dependencies'),
											<div class={styles.dependencyGroups}>
												{dependencyVariants.map((view) => (
													<div key={view.targets.join()} class={styles.dependencyVariant}>
														{view.targets.length ? (
															<p class={styles.muted}>
																{view.targets.map((target) => (target ? platformName(target) : label('defaultConfiguration'))).join(' · ')}
															</p>
														) : null}
														<div class={styles.dependencyCategories}>
															{view.groups.map((group) => (
																<div key={group.key} class={styles.dependencyCategory}>
																	<h3>{label(group.key as DetailLabel)}</h3>
																	<ul>
																		{group.dependencies.map((entry) => (
																			<li key={entry.name}>{dependency(entry)}</li>
																		))}
																	</ul>
																</div>
															))}
														</div>
													</div>
												))}
											</div>,
										)
									: null}

								{isFormula && hasValue(entry.options) ? section(label('options'), code(entry.options)) : null}
								{conflicts.length
									? section(
											label('conflicts'),
											<>
												<p>{conflicts.join(', ')}</p>
												{hasValue(entry.conflicts_with_reasons) ? code(entry.conflicts_with_reasons) : null}
											</>,
										)
									: null}
								{!isFormula && strings(entry.languages).length ? section(label('languages'), <p>{strings(entry.languages).join(', ')}</p>) : null}
								{!isFormula && artifacts.length > 0
									? section(
											label('artifacts'),
											<dl class={styles.facts}>
												{artifacts.map(([name, value], index) => (
													<div key={`${index}:${name}`} style={{ display: 'contents' }}>
														{fact(name, code(value))}
													</div>
												))}
											</dl>,
										)
									: null}

								{isFormula && services.length
									? section(
											label('service'),
											<div class={styles.serviceBody}>
												<p class={styles.muted}>{label('serviceHint')}</p>
												<div class={styles.serviceCommands}>
													<div>
														<h3>{label('serviceStart')}</h3>
														<CodeBlock code={`brew services start ${fullName(props.kind, props.item)}`} language="bash" copyable />
													</div>
													<div>
														<h3>{label('serviceStop')}</h3>
														<CodeBlock code={`brew services stop ${fullName(props.kind, props.item)}`} language="bash" copyable />
													</div>
												</div>
												<div class={styles.serviceConfigurations}>
													<h3>{help('serviceConfiguration', 'serviceConfigurationHelp')}</h3>
													{services.map((view) => (
														<div key={view.targets.join()}>
															{view.targets.length ? (
																<p class={styles.muted}>
																	{view.targets.map((target) => (target ? platformName(target) : label('defaultConfiguration'))).join(' · ')}
																</p>
															) : null}
															{code(view.value)}
														</div>
													))}
												</div>
											</div>,
										)
									: null}
							</>
						</div>

						<aside class={styles.aside}>
							<PackageInformation kind={props.kind} item={props.item} updatedAt={props.updatedAt} />
							<ProjectLinks primary={primaryLinks} more={moreLinks} />
							<PackageStatistics analytics={props.item.analytics} />
						</aside>
					</div>

					<details class={styles.raw}>
						<summary>{label('nativeJson')}</summary>
						<p class={styles.muted}>{label('nativeJsonHint')}</p>
						{code(props.item)}
					</details>
				</article>
			);
		};
	},
});
