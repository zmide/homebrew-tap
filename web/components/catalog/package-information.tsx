import { defineComponent, type PropType, type VNodeChild } from 'vue';
import HelpTip from './help-tip';
import { useCatalogLocale } from '@/composables/locale';
import { displayName, isRecord, rosettaRequirement, strings, text, version } from '@/lib/homebrew/helpers';
import type { HomebrewPackage, PackageKind } from '@/lib/homebrew/types';
import styles from '@/lib/homebrew/package-detail.module.scss';

export default defineComponent({
	name: 'PackageInformation',
	props: { kind: { type: String as PropType<PackageKind>, required: true }, item: { type: Object as PropType<HomebrewPackage>, required: true }, updatedAt: String },
	setup(props) {
		const { t, locale } = useCatalogLocale();
		const label = (key: string) => t(`detail.${key}`);
		const title = (key: string, help?: string) => (
			<span class={styles.helpLabel}>
				<span>{label(key)}</span>
				{help ? <HelpTip label={`${label('helpAbout')} ${label(key)}`} text={label(help)} /> : null}
			</span>
		);
		const fact = (key: string, value: VNodeChild, help?: string) => (
			<>
				<dt>{title(key, help)}</dt>
				<dd>{value}</dd>
			</>
		);
		return () => {
			const item = props.item;
			const formula = props.kind === 'formula';
			const versions = isRecord(item.versions) ? item.versions : {};
			const aliases = strings(formula ? item.aliases : item.name).filter((alias) => alias !== displayName(props.kind, item));
			const oldNames = strings(formula ? item.oldnames : item.old_tokens);
			const rosetta = rosettaRequirement(item);
			const updated =
				props.updatedAt && Number.isFinite(Date.parse(props.updatedAt))
					? new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(props.updatedAt))
					: undefined;
			const packageVersion = version(props.kind, item);
			const facts = [
				packageVersion !== '—' ? fact('version', <code>{packageVersion}</code>) : null,
				formula && text(versions.head) ? fact('head', <code>{String(versions.head)}</code>, 'headHelp') : null,
				formula && typeof item.revision === 'number' && item.revision > 0 ? fact('revision', item.revision, 'revisionHelp') : null,
				text(item.license) ? fact('license', item.license) : null,
				updated ? fact('updated', <time datetime={props.updatedAt}>{updated}</time>, 'updatedHelp') : null,
				aliases.length ? fact('aliases', aliases.join(', ')) : null,
				oldNames.length ? fact('oldNames', oldNames.join(', ')) : null,
				!formula && typeof item.auto_updates === 'boolean' ? fact('autoUpdates', label(item.auto_updates ? 'yes' : 'no')) : null,
				!formula && rosetta !== undefined ? fact('rosetta', label(rosetta ? 'yes' : 'no'), 'rosettaHelp') : null,
			].filter(Boolean);
			return facts.length ? (
				<section class={styles.section}>
					<h2>{label('metadata')}</h2>
					<dl class={styles.facts}>{facts}</dl>
				</section>
			) : null;
		};
	},
});
