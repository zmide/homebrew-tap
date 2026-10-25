import { createHighlighterCoreSync } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import bash from 'shiki/langs/bash.mjs';
import json from 'shiki/langs/json.mjs';
import githubLight from 'shiki/themes/github-light.mjs';
import githubDark from 'shiki/themes/github-dark.mjs';

export type CodeLanguage = 'bash' | 'json' | 'text';

// A synchronous, limited bundle keeps SSR and hydration identical, without WASM,
// runtime grammar downloads, generated HTML, or a full language/theme bundle.
const highlighter = createHighlighterCoreSync({
	engine: createJavaScriptRegexEngine(),
	langs: [bash, json],
	themes: [githubLight, githubDark],
});

export function highlightCode(source: string, language: CodeLanguage) {
	return highlighter.codeToTokens(source, {
		lang: language,
		themes: { light: 'github-light', dark: 'github-dark' },
		defaultColor: false,
	}).tokens;
}
