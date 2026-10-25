import { isRecord } from './helpers';

export const analyticsRanges = ['30d', '90d', '365d'] as const;
export type AnalyticsRange = (typeof analyticsRanges)[number];
export interface AnalyticsWindow {
	range: AnalyticsRange;
	installs: Array<{ name: string; count: number }>;
	total: number;
	requested?: number;
	errors?: number;
}

function counts(value: unknown) {
	if (!isRecord(value)) return undefined;
	const entries = Object.entries(value);
	if (!entries.length || entries.some(([name, count]) => !name.trim() || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)) return undefined;
	const total = entries.reduce((sum, [, count]) => sum + (count as number), 0);
	if (!Number.isSafeInteger(total)) return undefined;
	return { entries: entries.map(([name, count]) => ({ name, count: count as number })), total };
}

/** Native rolling windows are aggregates, never daily history points. */
export function analyticsWindows(value: unknown): AnalyticsWindow[] {
	if (!isRecord(value) || !isRecord(value.install)) return [];
	const install = value.install;
	return analyticsRanges.flatMap((range) => {
		const installs = counts(install[range]);
		if (!installs) return [];
		const requested = isRecord(value.install_on_request) ? counts(value.install_on_request[range])?.total : undefined;
		const errors = isRecord(value.build_error) ? counts(value.build_error[range])?.total : undefined;
		return [{ range, installs: installs.entries.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)), total: installs.total, requested, errors }];
	});
}

export function analyticsChart(value: unknown) {
	const windows = analyticsWindows(value);
	const categories = [...new Set(windows.flatMap((window) => window.installs.map((entry) => entry.name)))].sort();
	const maximum = Math.max(0, ...windows.flatMap((window) => window.installs.map((entry) => entry.count)));
	return { windows, categories, maximum, latest: windows.at(-1) };
}
