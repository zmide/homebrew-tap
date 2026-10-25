import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { baseURL, webDirectory } from './tests/e2e/settings.mjs';

const localChrome =
	!process.env.CI && ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/opt/google/chrome/chrome'].some((path) => existsSync(path));

export default defineConfig({
	testDir: './tests/e2e',
	testMatch: '**/*.spec.ts',
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 2 : 4,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		locale: 'en-US',
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: localChrome ? 'chrome' : undefined } }],
	webServer: {
		command: `"${process.execPath}" tests/e2e/serve.mjs`,
		cwd: webDirectory,
		url: baseURL,
		reuseExistingServer: false,
		timeout: 15_000,
	},
});
