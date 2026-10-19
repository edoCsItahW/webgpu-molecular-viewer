// 启动 mol-vista 的 Vite dev server（不自动开浏览器），供 CDP 驱动
import {createRequire} from 'node:module';

const require = createRequire('E:/code/webgpu-molecular-viewer/code/frontend/mol-vista/package.json');
const {createServer} = require('vite');

const root = 'E:\\code\\webgpu-molecular-viewer\\code\\frontend\\mol-vista';

const server = await createServer({
    configFile: root + '\\vite.config.ts',
    root,
    cacheDir: 'E:\\code\\webgpu-molecular-viewer\\bench\\.vite-cache',
    server: {
        host: '127.0.0.1',
        port: 7265,
        strictPort: true,
        open: false,
        hmr: {port: 7266},
    },
    logLevel: 'info',
});

await server.listen();
const urls = server.resolvedUrls;
console.log('DEV_SERVER_READY', JSON.stringify(urls));
