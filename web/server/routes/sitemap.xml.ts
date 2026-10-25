import config from '../../../tap.config.json';
import entries from '../../.generated/search-index.json';

export default defineEventHandler((event) => {
	setHeader(event, 'content-type', 'application/xml; charset=utf-8');
	const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
	const paths = ['/', '/formula/', '/cask/', ...entries.map((entry) => `/${entry.kind}/${encodeURIComponent(entry.name)}/`)];
	const base = process.env.NUXT_APP_BASE_URL || config.site.basePath;
	const urls = config.i18n.locales.flatMap((locale) =>
		paths.map((path) => `${config.site.origin}${base.replace(/\/$/, '')}${locale === config.i18n.defaultLocale ? '' : `/${locale}`}${path}`),
	);
	return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${escape(url)}</loc></url>`).join('')}</urlset>`;
});
