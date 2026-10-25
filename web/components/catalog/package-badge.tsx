import { computed, defineComponent, ref, useId, watch, type PropType } from 'vue';
import { Check, Copy } from '@lucide/vue';
import { Button } from '../ui/button';
import CodeBlock from './code-block';
import { useClipboardText } from '../../composables/clipboard';
import { useCatalogLocale } from '../../composables/locale';
import { config, withBase } from '../../lib/config';
import { defaultBadgeOptions, packageBadge } from '../../lib/homebrew/badges';
import { packageName, packagePath } from '../../lib/homebrew/helpers';
import type { HomebrewPackage, PackageKind } from '../../lib/homebrew/types';
import styles from '../../lib/homebrew/package-badge.module.scss';

export default defineComponent({
	name: 'PackageBadge',
	props: {
		kind: { type: String as PropType<PackageKind>, required: true },
		item: { type: Object as PropType<HomebrewPackage>, required: true },
	},
	setup(props) {
		const { t, localPath } = useCatalogLocale();
		const label = (key: string) => t(`detail.badge${key}`);
		const showFallback = ref(false);
		const tooltipDismissed = ref(false);
		const tooltipId = useId();
		const badge = computed(() => packageBadge(props.kind, props.item, defaultBadgeOptions, { origin: config.site.origin, basePath: withBase('/') }));
		const markdown = computed(() => badge.value?.markdown ?? '');
		// Browsers parse noscript as raw text when scripting is enabled. Keep it
		// opaque to Vue hydration, but safely render selectable HTML without JS.
		const noScriptHtml = computed(
			() =>
				`<pre class="syntax-highlight code-block" data-language="text"><code>${markdown.value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`,
		);
		const { status, copy, reset } = useClipboardText(() => markdown.value);
		watch(
			[markdown, () => badge.value?.message],
			() => {
				showFallback.value = false;
				reset();
			},
			{ flush: 'sync' },
		);
		async function copyMarkdown() {
			const success = await copy();
			if (success !== undefined) {
				showFallback.value = !success;
				tooltipDismissed.value = false;
			}
		}
		return () => {
			const value = badge.value;
			if (!value) return null;
			return (
				<div class={styles.badge} role="group" aria-label={label('Title')} data-package-badge>
					<div class={styles.toolbar}>
						<div class={styles.preview}>
							<a href={withBase(localPath(packagePath(props.kind, packageName(props.kind, props.item))!))}>
								<span
									role="img"
									aria-label={`${value.alt}: ${value.message}`}
									class={[styles.previewBadge, value.unknownVersion && styles.unknown]}
									data-badge-preview>
									<span class={styles.previewLabel} aria-hidden="true">
										<img src={withBase('/homebrew.svg')} alt="" width="12" height="14" />
										Homebrew
									</span>
									<span class={styles.previewMessage} aria-hidden="true">
										{value.message}
									</span>
								</span>
							</a>
						</div>
						<span
							class={styles.copyControl}
							onMouseenter={() => {
								tooltipDismissed.value = false;
							}}
							onFocusin={() => {
								tooltipDismissed.value = false;
							}}
							onKeydown={(event) => {
								if (event.key === 'Escape') tooltipDismissed.value = true;
							}}>
							<Button variant="ghost" size="icon-sm" class={styles.copyButton} aria-label={label('CopyMarkdown')} aria-describedby={tooltipId} onClick={copyMarkdown}>
								{status.value === 'copied' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
							</Button>
							<span id={tooltipId} role="tooltip" class={[styles.tooltip, status.value === 'copied' && styles.copied, tooltipDismissed.value && styles.dismissed]}>
								{label(status.value === 'copied' ? 'Copied' : 'CopyMarkdown')}
							</span>
						</span>
					</div>
					<span class={showFallback.value ? [styles.feedback, styles.error] : 'sr-only'} role="status">
						{showFallback.value ? label('CopyFailed') : status.value === 'copied' ? label('Copied') : ''}
					</span>
					{showFallback.value ? <CodeBlock code={markdown.value} language="text" /> : null}
					<noscript innerHTML={noScriptHtml.value} />
				</div>
			);
		};
	},
});
