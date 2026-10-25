import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import CodeBlock from '../components/catalog/code-block';

describe('GitHub syntax highlighting', () => {
	it('renders shell command tokens with both theme colors and preserves exact copyable text', () => {
		const command = 'brew install --cask example/tools/app';
		const wrapper = mount(CodeBlock, { props: { code: command, language: 'bash', inline: true } });
		expect(wrapper.element.tagName).toBe('CODE');
		expect(wrapper.element.textContent).toBe(command);
		expect(wrapper.get('span[style]').attributes('style')).toContain('--shiki-light:');
		expect(wrapper.get('span[style]').attributes('style')).toContain('--shiki-dark:');
		wrapper.unmount();
	});

	it('preserves JSON indentation, newlines and trailing newline', () => {
		const code = '{\n  "version": "1.0",\n  "enabled": true\n}\n';
		const wrapper = mount(CodeBlock, { props: { code, language: 'json' } });
		expect(wrapper.element.tagName).toBe('PRE');
		expect(wrapper.get('code').element.textContent).toBe(code);
		expect(wrapper.attributes('tabindex')).toBe('0');
		expect(wrapper.findAll('span[style]').length).toBeGreaterThan(3);
		wrapper.unmount();
	});

	it('renders untrusted package text as text nodes, not HTML', () => {
		const code = '{"value":"<script>alert(1)</script><img src=x onerror=alert(1)>"}';
		const wrapper = mount(CodeBlock, { props: { code, language: 'json' } });
		expect(wrapper.find('script').exists()).toBe(false);
		expect(wrapper.find('img').exists()).toBe(false);
		expect(wrapper.get('code').element.textContent).toBe(code);
		wrapper.unmount();
	});

	it('supports empty and plain text without changing package caveats', async () => {
		const wrapper = mount(CodeBlock, { props: { code: '' } });
		expect(wrapper.get('code').element.textContent).toBe('');
		const code = 'Before starting:\n  brew services start example/tools/app\n';
		await wrapper.setProps({ code });
		expect(wrapper.get('code').element.textContent).toBe(code);
		wrapper.unmount();
	});
});
