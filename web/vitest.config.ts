import { fileURLToPath } from 'node:url';
import vueJsx from '@vitejs/plugin-vue-jsx';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	root: fileURLToPath(new URL('.', import.meta.url)),
	plugins: [vueJsx()],
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('.', import.meta.url)),
			'#components': fileURLToPath(new URL('./tests/stubs/nuxt-components.ts', import.meta.url)),
		},
	},
	test: {
		environment: 'happy-dom',
		include: ['tests/**/*.test.ts'],
		exclude: ['tests/e2e/**', '**/node_modules/**', '.generated/**', '.nuxt/**', '.output/**'],
		clearMocks: true,
		restoreMocks: true,
	},
});
