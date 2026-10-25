import { defineComponent, type PropType } from 'vue';
import { CircleCheck, CircleMinus, CircleX } from '@lucide/vue';
import HelpTip from './help-tip';
import { platformName } from '@/lib/homebrew/platforms';
import type { PlatformSupport } from '@/lib/homebrew/detail-view';
import { useCatalogLocale } from '@/composables/locale';
import { withBase } from '@/lib/config';
import styles from '@/lib/homebrew/package-detail.module.scss';

export default defineComponent({
	name: 'PlatformSupport',
	props: { platforms: { type: Array as PropType<PlatformSupport[]>, required: true }, rosetta: Boolean },
	setup(props) {
		const { t } = useCatalogLocale();
		const label = (key: string) => t(`detail.${key}`);
		return () => (
			<section class={[styles.section, styles.platforms]} aria-label={label('platformSupport')}>
				<h2>{label('platformSupport')}</h2>
				{props.platforms.length ? (
					<div class={styles.platformGrid}>
						{props.platforms.map((platform) => (
							<div key={platform.system} class={styles.platform}>
								<div class={styles.platformHeading}>
									<span
										class={[styles.systemIcon, platform.architectures.some((arch) => arch.status === 'supported') && styles.systemSupported]}
										aria-hidden="true">
										<img
											src={withBase(platform.system === 'macOS' ? '/apple.svg' : '/linux.svg')}
											alt=""
											width="32"
											height="32"
											class={platform.system === 'macOS' ? styles.appleIcon : undefined}
										/>
									</span>
									<h3>{platform.system}</h3>
								</div>
								<ul>
									{platform.architectures.map((arch) => {
										const StatusIcon = arch.status === 'supported' ? CircleCheck : arch.status === 'unsupported' ? CircleX : CircleMinus;
										return (
											<li key={arch.name} data-status={arch.status}>
												<span>{arch.name}</span>
												<span class={styles.supportState}>
													<StatusIcon size={14} stroke-width={1.5} aria-hidden="true" />
													<span>
														{label(
															arch.status === 'supported' && arch.availability
																? arch.availability === 'download'
																	? 'binaryAvailable'
																	: 'bottleAvailable'
																: arch.status,
														)}
													</span>
												</span>
											</li>
										);
									})}
								</ul>
								{platform.minimum ? (
									<p class={styles.muted}>
										{platform.system} {platform.minimum}
									</p>
								) : null}
								{platform.bottleTargets?.length ? (
									<p class={styles.muted}>
										<span class={styles.helpLabel}>
											<span>{label('bottles')}</span>
											<HelpTip label={`${label('helpAbout')} ${label('bottles')}`} text={label('bottleHelp')} />
										</span>
										<br />
										{platform.bottleTargets.map(platformName).join(' · ')}
									</p>
								) : null}
							</div>
						))}
					</div>
				) : (
					<p class={styles.muted}>{label('platformNotListed')}</p>
				)}
				{props.platforms.some((platform) => platform.architectures.some((arch) => arch.availability === 'download')) ? (
					<p class={styles.muted}>{label('binaryHelp')}</p>
				) : null}
				{props.rosetta ? (
					<p class={styles.requirement}>
						<span class={styles.helpLabel}>
							<span>{label('rosetta')}</span>
							<HelpTip label={`${label('helpAbout')} Rosetta`} text={label('rosettaHelp')} />
						</span>
					</p>
				) : null}
			</section>
		);
	},
});
