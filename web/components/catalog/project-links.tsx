import { defineComponent, type PropType } from 'vue';
import { useCatalogLocale } from '@/composables/locale';
import styles from '@/lib/homebrew/package-detail.module.scss';

export interface ProjectLink {
	label: string;
	href: string;
}
export default defineComponent({
	name: 'ProjectLinks',
	props: {
		primary: { type: Array as PropType<ProjectLink[]>, required: true },
		more: { type: Array as PropType<ProjectLink[]>, required: true },
	},
	setup(props) {
		const { t } = useCatalogLocale();
		return () => (
			<>
				{props.primary.length ? (
					<section class={styles.section}>
						<h2>{t('detail.links')}</h2>
						<ul class={styles.links}>
							{props.primary.map((link) => (
								<li key={link.href}>
									<h3>{link.label}</h3>
									<a class={styles.linkUrl} href={link.href}>
										{link.href} <span aria-hidden="true">↗</span>
									</a>
								</li>
							))}
						</ul>
					</section>
				) : null}
				{props.more.length ? (
					<section class={styles.section}>
						<h2>{t('detail.moreLinks')}</h2>
						<ul class={styles.moreLinks}>
							{props.more.map((link) => (
								<li key={link.href}>
									<a href={link.href}>
										{link.label} <span aria-hidden="true">↗</span>
									</a>
								</li>
							))}
						</ul>
					</section>
				) : null}
			</>
		);
	},
});
