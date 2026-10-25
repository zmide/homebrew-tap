import { computed, defineComponent, type PropType } from 'vue';
import { Check, Copy } from '@lucide/vue';
import { Button } from '../ui/button';
import { useCatalogLocale } from '../../composables/locale';
import { highlightCode, type CodeLanguage } from '../../lib/highlight';
import { useClipboardText } from '../../composables/clipboard';

export default defineComponent({
	name: 'CodeBlock',
	props: {
		code: { type: String, required: true },
		language: { type: String as PropType<CodeLanguage>, default: 'text' },
		inline: Boolean,
		copyable: Boolean,
	},
	setup(props) {
		const t = props.copyable ? useCatalogLocale().t : (key: string) => key;
		const { status, copy } = useClipboardText(() => props.code);
		const lines = computed(() => highlightCode(props.code, props.language));
		const content = () =>
			lines.value.map((tokens, index) => (
				<>
					{index > 0 ? '\n' : null}
					<span class="code-line">
						{tokens.map((token) => (
							<span style={token.htmlStyle}>{token.content}</span>
						))}
					</span>
				</>
			));
		const block = () => (
			<pre class="code-block syntax-highlight" tabindex={0} data-language={props.language}>
				<code>{content()}</code>
			</pre>
		);
		return () =>
			props.copyable ? (
				<div class="copyable-code">
					{block()}
					<Button class="code-copy" variant="ghost" size="icon-sm" onClick={copy} aria-label={t(status.value === 'copied' ? 'copy.copied' : 'copy.copy')}>
						{status.value === 'copied' ? <Check size={15} /> : <Copy size={15} />}
					</Button>
					<span class={['copy-feedback', { 'is-error': status.value === 'failed' }]} role="status">
						{status.value !== 'idle' ? t(`copy.${status.value}`) : ''}
					</span>
				</div>
			) : props.inline ? (
				<code class="syntax-highlight syntax-inline" data-language={props.language}>
					{content()}
				</code>
			) : (
				block()
			);
	},
});
