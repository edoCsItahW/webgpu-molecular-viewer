// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file server.mjs
 * @author edocsitahw
 * @version 1.0
 * @date 2026/11/02
 * @desc 基准专用 Vite dev server（无 devtools），并通过 /__bench__/asset/:id 暴露数据集，
 *       避免把 17 MB CIF 通过 CDP 逐字符传入页面。
 * */
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {readDataset} from './datasets.mjs';
import {APP_ROOT, CACHE_ROOT, ensureCache} from './env.mjs';

const require = createRequire(join(APP_ROOT, 'package.json'));
const {createServer} = require('vite');
const vue = require('@vitejs/plugin-vue');

const MIME = {
    pdb: 'text/plain; charset=utf-8',
    cif: 'text/plain; charset=utf-8',
    sdf: 'text/plain; charset=utf-8',
};

function benchAssetPlugin() {
    return {
        name: 'bench-assets',
        configureServer(server) {
            server.middlewares.use('/__bench__/asset/', (request, response) => {
                const id = decodeURIComponent((request.url ?? '').split('?')[0].replace(/^\/+/, ''));

                try {
                    const dataset = readDataset(id);

                    response.statusCode = 200;
                    response.setHeader('Content-Type', MIME[dataset.format] ?? 'text/plain; charset=utf-8');
                    response.setHeader('Cache-Control', 'no-store');
                    response.end(dataset.text);
                } catch (error) {
                    response.statusCode = 404;
                    response.setHeader('Content-Type', 'application/json');
                    response.end(JSON.stringify({error: String(error)}));
                }
            });
        },
    };
}

/**
 * @param {{port?: number}} [options]
 */
export async function startServer({port = 7271} = {}) {
    ensureCache();

    const server = await createServer({
        root: APP_ROOT,
        configFile: false,
        cacheDir: join(CACHE_ROOT, 'vite'),
        resolve: {alias: {'@': join(APP_ROOT, 'src')}},
        plugins: [vue(), benchAssetPlugin()],
        server: {host: '127.0.0.1', port, strictPort: true, open: false},
        logLevel: 'warn',
    });

    await server.listen();

    const address = server.httpServer?.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    const url = `http://127.0.0.1:${actualPort}/`;

    return {
        url,
        port: actualPort,
        async close() {
            await server.close();
        },
    };
}
