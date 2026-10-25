import { defineComponent } from 'vue';
import { config, withBase } from './lib/config';

export default defineComponent({
	setup() {
		return () => (
			<main class="error-page">
				<span class="eyebrow">404</span>
				<h1>Page not found</h1>
				<p>The requested page does not exist.</p>
				<a class="back-link" href={withBase('/')}>
					← Back to {config.brand.name} / tap
				</a>
			</main>
		);
	},
});
