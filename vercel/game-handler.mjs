import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {migrationRouter} from '../cloudflare/lib/migration-router.mjs';

export default async function handler(req, res) {
    const url = new URL(req.url, 'https://' + (req.headers.host || 'dill-doh.vercel.app'));
    const route = url.searchParams.get('__route');
    url.searchParams.delete('__route');
    if (route !== null) url.pathname = '/' + route;
    if (!/^\/(?:ports\/|halo-mobile\/|__migration\/health$)/.test(url.pathname)) {
        res.statusCode = 404;
        res.end('Not found');
        return;
    }
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableFinished) controller.abort(); });
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    }
    const options = {method: req.method, headers, signal: controller.signal};
    if (!['GET', 'HEAD'].includes(req.method)) {
        options.body = Readable.toWeb(req);
        options.duplex = 'half';
    }
    try {
        const response = await migrationRouter(new Request(url, options), {});
        if (!response) { res.statusCode = 404; res.end('Not found'); return; }
        res.statusCode = response.status;
        response.headers.forEach((value, name) => res.setHeader(name, value));
        if (req.method === 'HEAD' || !response.body) { res.end(); return; }
        // Stream game downloads with backpressure instead of buffering them.
        res.flushHeaders();
        await pipeline(Readable.fromWeb(response.body), res);
    } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Game request failed:', error.message);
        if (res.headersSent) res.destroy();
        else { res.statusCode = 503; res.end('Download temporarily unavailable. Please retry.'); }
    }
}
