import { defineComponent } from 'vue';
import CodeBlock from './code-block';
import { noteBlocks } from '@/lib/homebrew/detail-view';
import { safeExternalUrl } from '@/lib/homebrew/helpers';
import styles from '@/lib/homebrew/package-detail.module.scss';

export default defineComponent({
	name: 'PackageNotes',
	props: { text: { type: String, required: true } },
	setup(props) {
		const linked = (value: string) =>
			value.split(/(https?:\/\/[^\s<>]+)/g).map((part) => {
				const url = safeExternalUrl(part);
				return url ? <a href={url}>{part}</a> : part;
			});
		return () => (
			<div class={styles.notes}>
				{noteBlocks(props.text).map((block, index) =>
					block.type === 'command' ? (
						<CodeBlock key={index} code={block.value} language="bash" copyable />
					) : block.type === 'pre' ? (
						<pre key={index}>{block.value}</pre>
					) : (
						<p key={index}>{linked(block.value)}</p>
					),
				)}
			</div>
		);
	},
});
