// 微基准静态服务：页面 + 场景数据
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const DIR = 'E:/code/webgpu-molecular-viewer/bench/micro';
const PORT = Number(process.argv[2] ?? 7268);

createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = join(DIR, path.replace(/^\//, ''));
    try {
        const data = readFileSync(file);
        const type = path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.json') ? 'application/json' : 'text/html';
        res.writeHead(200, {'Content-Type': `${type}; charset=utf-8`});
        res.end(data);
    } catch {
        res.writeHead(404).end('not found');
    }
}).listen(PORT, '127.0.0.1', () => console.log('MICRO_SERVER_READY', PORT));
