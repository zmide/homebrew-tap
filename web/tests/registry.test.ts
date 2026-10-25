import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { getBadgeStyleKeys, getButtonStyleKeys, getInputIds, getInputAriaProps, isButtonDisabled } from '../components/ui/lib/core';

describe('registry component event integration', () => {
	it('forwards a button click exactly once with its native event and attributes', () => {
		const onClick = vi.fn((event: MouseEvent) => event.preventDefault());
		const wrapper = mount(Button, {
			props: { type: 'submit', onClick },
			attrs: { id: 'copy-button', class: 'extra-button', 'aria-label': 'Copy' },
		});
		const button = wrapper.get('button');
		const event = new MouseEvent('click', { bubbles: true, cancelable: true });
		button.element.dispatchEvent(event);
		expect(onClick).toHaveBeenCalledExactlyOnceWith(event);
		expect(wrapper.emitted('click')).toEqual([[event]]);
		expect(event.defaultPrevented).toBe(true);
		expect(button.attributes()).toMatchObject({ id: 'copy-button', type: 'submit', 'aria-label': 'Copy' });
		expect(button.classes()).toContain('extra-button');
		wrapper.unmount();
	});

	it.each([{ disabled: true }, { loading: true }])('keeps native disabled behavior for %j', (props) => {
		const onClick = vi.fn();
		const wrapper = mount(Button, { props: { ...props, onClick } });
		expect(wrapper.get('button').element.disabled).toBe(true);
		wrapper.get('button').element.click();
		expect(onClick).not.toHaveBeenCalled();
		expect(wrapper.emitted('click')).toBeUndefined();
		wrapper.unmount();
	});

	it('forwards keyboard events from the input, preserving preventDefault', () => {
		const onKeydown = vi.fn((event: KeyboardEvent) => event.preventDefault());
		const wrapper = mount(Input, {
			props: { autocomplete: 'off', onKeydown },
			attrs: { name: 'search', class: 'extra-input', 'aria-label': 'Search', 'data-test': 'search' },
		});
		const input = wrapper.get('input');
		const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
		input.element.dispatchEvent(event);
		wrapper.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
		expect(onKeydown).toHaveBeenCalledExactlyOnceWith(event);
		expect(wrapper.emitted('keydown')).toEqual([[event]]);
		expect(event.defaultPrevented).toBe(true);
		expect(input.attributes()).toMatchObject({ autocomplete: 'off', name: 'search', 'aria-label': 'Search', 'data-test': 'search' });
		expect(input.classes()).toContain('extra-input');
		expect(wrapper.attributes('name')).toBeUndefined();
		wrapper.unmount();
	});

	it('preserves model updates and undeclared native input listeners', async () => {
		const onUpdate = vi.fn();
		const onInput = vi.fn();
		const onFocus = vi.fn();
		const wrapper = mount(Input, {
			props: { modelValue: 'before', 'onUpdate:modelValue': onUpdate },
			attrs: { onInput, onFocus },
		});
		await wrapper.get('input').setValue('after');
		await wrapper.get('input').trigger('focus');
		expect(onUpdate).toHaveBeenCalledExactlyOnceWith('after');
		expect(wrapper.emitted('update:modelValue')).toEqual([['after']]);
		expect(onInput).toHaveBeenCalledTimes(1);
		expect(onFocus).toHaveBeenCalledTimes(1);
		wrapper.unmount();
	});
});

describe('retained registry helpers', () => {
	it('maps variants and hyphenated sizes to CSS module keys', () => {
		expect(getBadgeStyleKeys()).toEqual({ base: 'badge', variant: 'variantDefault' });
		expect(getBadgeStyleKeys('outline').variant).toBe('variantOutline');
		expect(getButtonStyleKeys()).toEqual({ base: 'button', variant: 'variantDefault', size: 'sizeDefault' });
		expect(getButtonStyleKeys('ghost', 'icon-xs')).toEqual({ base: 'button', variant: 'variantGhost', size: 'sizeIconXs' });
		expect(isButtonDisabled()).toBe(false);
		expect(isButtonDisabled(false, true)).toBe(true);
	});

	it('prioritizes input errors over helper text and omits absent ARIA state', () => {
		const ids = getInputIds('search');
		expect(ids).toEqual({ input: 'search', error: 'search-error', helper: 'search-helper' });
		expect(getInputAriaProps(ids)).toEqual({ 'aria-invalid': undefined, 'aria-describedby': undefined });
		expect(getInputAriaProps(ids, '', 'Help')).toEqual({ 'aria-invalid': undefined, 'aria-describedby': 'search-helper' });
		expect(getInputAriaProps(ids, 'Invalid', 'Help')).toEqual({ 'aria-invalid': true, 'aria-describedby': 'search-error' });
	});

	it('renders accessible input messages and forwards badge attributes', () => {
		const input = mount(Input, { props: { id: 'name', label: 'Name', error: 'Invalid', helperText: 'Help', required: true } });
		expect(input.get('label').attributes('for')).toBe('name');
		expect(input.get('input').attributes()).toMatchObject({ 'aria-invalid': 'true', 'aria-describedby': 'name-error', required: '' });
		expect(input.get('#name-error').text()).toBe('Invalid');
		expect(input.find('#name-helper').exists()).toBe(false);
		input.unmount();
		const badge = mount(Badge, { props: { variant: 'outline' }, attrs: { id: 'version', class: 'custom' }, slots: { default: '1.0' } });
		expect(badge.attributes('id')).toBe('version');
		expect(badge.classes()).toContain('custom');
		expect(badge.text()).toBe('1.0');
		badge.unmount();
	});
});
