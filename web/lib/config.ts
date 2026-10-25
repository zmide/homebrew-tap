import raw from '../../tap.config.json';

export interface TapConfig {
	brand: { name: string; title: string; description: string; descriptionZh?: string; logo?: string };
	tap: string;
	repository: string;
	site: { origin: string; basePath: string };
	i18n: { defaultLocale: string; locales: string[] };
	recentLimit: number;
	links?: Record<string, { repository?: string; releases?: string }>;
	platformSupport?: Record<string, Array<{ system: string; architectures: Array<{ name: string; status: string }>; source: string }>>;
}
export const config: TapConfig = raw;
export type Locale = 'en' | 'zh-CN';

export function withBase(path: string): string {
	const base = import.meta.env.VITE_TAP_BASE_URL || config.site.basePath;
	return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

export function localizedPath(path: string, locale: string): string {
	const clean = `/${path.replace(/^\//, '')}`;
	return locale === config.i18n.defaultLocale ? clean : `/${locale}${clean}`;
}
