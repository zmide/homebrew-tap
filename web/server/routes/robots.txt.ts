import config from '../../../tap.config.json';

export default defineEventHandler((event) => {
	setHeader(event, 'content-type', 'text/plain; charset=utf-8');
	return `User-agent: *\nAllow: /\nSitemap: ${config.site.origin}${process.env.NUXT_APP_BASE_URL || config.site.basePath}sitemap.xml\n`;
});
