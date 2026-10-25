// @vitest-environment happy-dom

import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
	computeChartLayout,
	findSidebarActiveIndex,
	FormStore,
	getChartAreaPathD,
	getChartPathD,
	setInValue,
	toFieldArrayItems,
	validateFormField,
} from '../components/ui/lib/core';
import type { SidebarMenuItemDef } from '../components/ui/lib/core';

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
		const button = wrapper.get('button').element;

		expect(button.disabled).toBe(true);
		button.click();
		expect(onClick).not.toHaveBeenCalled();
		expect(wrapper.emitted('click')).toBeUndefined();
		wrapper.unmount();
	});

	it('forwards keyboard events from the input, not its wrapper, with preventDefault intact', () => {
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
		const input = wrapper.get('input');
		await input.setValue('after');
		await input.trigger('focus');

		expect(onUpdate).toHaveBeenCalledExactlyOnceWith('after');
		expect(wrapper.emitted('update:modelValue')).toEqual([['after']]);
		expect(onInput).toHaveBeenCalledTimes(1);
		expect(onFocus).toHaveBeenCalledTimes(1);
		wrapper.unmount();
	});
});

describe('registry core strict-index edge cases', () => {
	it('keeps chart label positions when a row lacks its category key', () => {
		const layout = computeChartLayout({
			data: [{ value: 2 }, { category: 0, value: 3 }, { category: 'third', value: 4 }],
			config: {},
			series: [{ key: 'value' }],
			xKey: 'category',
			type: 'line',
			width: 320,
			height: 200,
		});

		expect(layout.xLabels).toEqual(['', 0, 'third']);
		expect(layout.xTickX).toHaveLength(3);
	});

	it('handles empty, single-point, and closed chart paths', () => {
		const first = { index: 0, x: 2, y: 3, value: 3 };
		const last = { index: 1, x: 8, y: 5, value: 5 };
		expect(getChartPathD([], true)).toBe('');
		expect(getChartAreaPathD([], 10)).toBe('');
		expect(getChartPathD([first], true)).toBe('M2,3 L2,3 L2,3 Z');
		expect(getChartAreaPathD([first], 10)).toBe('M2,3 L2,10 L2,10 Z');
		expect(getChartPathD([first, last], true)).toBe('M2,3 L8,5 L8,3 L2,3 Z');
		expect(getChartAreaPathD([first, last], 10)).toBe('M2,3 L8,5 L8,10 L2,10 Z');
	});

	it('writes nested object/array paths without mutating the original values', () => {
		const original = { items: [{ label: 'before' }], untouched: true };
		expect(setInValue(original, 'items.0.label', 'after')).toEqual({ items: [{ label: 'after' }], untouched: true });
		expect(original.items).toEqual([{ label: 'before' }]);
		expect(setInValue({}, 'items.0.label', 'created')).toEqual({ items: [{ label: 'created' }] });
	});

	it('validates named rules in order and preserves async failure messages', async () => {
		const later = vi.fn(() => true);
		expect(await validateFormField('name', '', {}, { validate: {} })).toBeUndefined();
		expect(
			await validateFormField(
				'name',
				'bad',
				{},
				{
					validate: { passes: () => true, remote: async () => 'Unavailable', later },
				},
			),
		).toEqual({ type: 'remote', message: 'Unavailable' });
		expect(later).not.toHaveBeenCalled();
		expect(await validateFormField('name', 'bad', {}, { validate: { rejected: () => false } })).toEqual({
			type: 'rejected',
			message: 'Validation failed',
		});
	});

	it('requires a stable ID for every field-array entry', () => {
		expect(toFieldArrayItems([], [])).toEqual([]);
		expect(toFieldArrayItems([{ label: 'first', id: 'old' }, null, 'third'], ['a', 'b', 'c'])).toEqual([
			{ label: 'first', id: 'a' },
			{ id: 'b', value: null },
			{ id: 'c', value: 'third' },
		]);
		expect(() => toFieldArrayItems(['first'], [])).toThrow(RangeError);
	});

	it('keeps generated IDs paired with values across swap/move', () => {
		const store = new FormStore({ items: ['a', 'b', 'c'] });
		const initial = store.getFieldArray('items');
		store.swap('items', 0, 2);
		expect(store.getFieldArray('items')).toEqual([initial[2], initial[1], initial[0]]);
		store.move('items', 2, 0);
		expect(store.getFieldArray('items')).toEqual([initial[0], initial[2], initial[1]]);
	});

	it.each([-1, 3, 0.5, Number.NaN, Number.POSITIVE_INFINITY])('ignores invalid field-array indices: %s', (index) => {
		const store = new FormStore({ items: ['a', 'b', 'c'] });
		const initial = store.getFieldArray('items');
		store.swap('items', index, 1);
		store.swap('items', 1, index);
		store.move('items', index, 1);
		store.move('items', 1, index);
		expect(store.getFieldArray('items')).toEqual(initial);
	});

	it('handles empty and sparse sidebar menus while preserving nested indices', () => {
		expect(findSidebarActiveIndex([], 'missing')).toEqual({ itemIndex: -1, subIndex: -1, activeSub: false });
		const items: SidebarMenuItemDef[] = [];
		const children: SidebarMenuItemDef[] = [];
		children[1] = { value: 'target' };
		items[1] = { value: 'parent', children };
		expect(findSidebarActiveIndex(items, 'parent')).toEqual({ itemIndex: 1, subIndex: -1, activeSub: false });
		expect(findSidebarActiveIndex(items, 'target')).toEqual({ itemIndex: 1, subIndex: 1, activeSub: true });
		expect(findSidebarActiveIndex(items, 'missing')).toEqual({ itemIndex: -1, subIndex: -1, activeSub: false });
	});
});
