// Adapted from Tile UI. Only helpers used by this site's registry components
// are retained; see ../README.md and the root THIRD_PARTY_NOTICES.md.
import { capitalize } from './utils';

export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link';
export type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
export type ButtonSize = 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg';

export interface InputBaseProps {
	label?: string;
	error?: string;
	helperText?: string;
	/** Visual control size, not the native numeric HTML size attribute. */
	controlSize?: 'default' | 'xs' | 'sm' | 'lg';
}

export function getBadgeStyleKeys(variant: BadgeVariant = 'default') {
	return { base: 'badge', variant: `variant${capitalize(variant)}` };
}

export function getButtonStyleKeys(variant: ButtonVariant = 'default', size: ButtonSize = 'default') {
	const pascal = (value: string) => value.split('-').map(capitalize).join('');
	return { base: 'button', variant: `variant${pascal(variant)}`, size: `size${pascal(size)}` };
}

export function isButtonDisabled(disabled?: boolean, loading?: boolean): boolean {
	return !!disabled || !!loading;
}

export function getInputIds(id: string) {
	return { input: id, error: `${id}-error`, helper: `${id}-helper` };
}

export function getInputAriaProps(ids: ReturnType<typeof getInputIds>, error?: string, helperText?: string) {
	return {
		'aria-invalid': !!error || undefined,
		'aria-describedby': error ? ids.error : helperText ? ids.helper : undefined,
	};
}
