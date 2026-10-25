import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { basePath, baseURL, host, port, publicDirectory } from './settings.mjs';

// Mount the actual static output, not an SPA fallback or Nuxt's development server.
const root = await realpath(publicDirectory).catch(() => {
	throw new Error('Static output is missing. Build a verified catalog and run pnpm --dir web generate before browser tests.');
});
await stat(resolve(root, 'index.html'));

const mime = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.map': 'application/json; charset=utf-8',
	'.txt': 'text/plain; charset=utf-8',
	'.xml': 'application/xml; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.avif': 'image/avif',
	'.gif': 'image/gif',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.wasm': 'application/wasm',
};

function contained(path) {
	const rel = relative(root, path);
	return rel !== '..' && !rel.startsWith(`..${sep}`) && !rel.startsWith(sep);
}

async function findFile(path) {
	let target = resolve(root, path || '.');
	if (!contained(target)) return undefined;
	try {
		if ((await stat(target)).isDirectory()) target = resolve(target, 'index.html');
		const actual = await realpath(target);
		return contained(actual) && (await stat(actual)).isFile() ? actual : undefined;
	} catch (error) {
		if (['ENOENT', 'ENOTDIR'].includes(error.code)) return undefined;
		throw error;
	}
}

const server = createServer(async (request, response) => {
	const send = (status, body, type = 'text/plain; charset=utf-8', headers = {}) => {
		response.writeHead(status, {
			'content-type': type,
			'content-length': Buffer.byteLength(body),
			'cache-control': 'no-store',
			'x-content-type-options': 'nosniff',
			...headers,
		});
		response.end(request.method === 'HEAD' ? undefined : body);
	};
	const notFound = async () => {
		const fallback = await findFile('404.html');
		send(404, fallback ? await readFile(fallback) : 'Not found', fallback ? mime['.html'] : undefined);
	};
	try {
		if (!['GET', 'HEAD'].includes(request.method || '')) return send(405, 'Method not allowed', undefined, { allow: 'GET, HEAD' });
		const rawPath = (request.url || '/').split(/[?#]/, 1)[0];
		let pathname;
		try {
			pathname = decodeURIComponent(rawPath);
		} catch {
			return send(400, 'Malformed URL');
		}
		if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some((part) => part === '.' || part === '..')) return send(403, 'Forbidden');
		if (basePath !== '/' && pathname === basePath.slice(0, -1)) return send(308, '', undefined, { location: basePath });
		if (!pathname.startsWith(basePath)) return await notFound();
		const path = pathname.slice(basePath.length);
		// Nitro may encode directory names containing @ or +; accept either output form.
		const file = (await findFile(path)) || (await findFile(rawPath.slice(basePath.length)));
		if (!file) return await notFound();
		send(200, await readFile(file), mime[extname(file)] || 'application/octet-stream');
	} catch (error) {
		console.error(error);
		if (!response.headersSent) send(500, 'Static server error');
		else response.destroy();
	}
});

server.listen(port, host, () => console.log(`Serving verified static output at ${baseURL}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
