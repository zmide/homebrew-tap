import { defineComponent } from 'vue';
import { Check, Copy } from '@lucide/vue';
import { Button } from '../ui/button';
import { useCatalogLocale } from '../../composables/locale';
import CodeBlock from './code-block';
import { useClipboardText } from '../../composables/clipboard';

export default defineComponent({
	name: 'CopyCommand',
	props: { command: { type: String, required: true } },
	setup(props) {
		const { t } = useCatalogLocale();
		const { status, copy } = useClipboardText(() => props.command);
		return () => (
			<div class="command-wrap">
				<div class="command">
					<span class="prompt" aria-hidden="true">
						$
					</span>
					<CodeBlock code={props.command} language="bash" inline />
					<Button variant="ghost" size="icon-sm" onClick={copy} aria-label={t(status.value === 'copied' ? 'copy.copied' : 'copy.copy')}>
						{status.value === 'copied' ? <Check size={15} /> : <Copy size={15} />}
					</Button>
				</div>
				<span class={['copy-feedback', { 'is-error': status.value === 'failed' }]} role="status">
					{status.value !== 'idle' ? t(`copy.${status.value}`) : ''}
				</span>
			</div>
		);
	},
});
