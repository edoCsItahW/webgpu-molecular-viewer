// 3Dmol.js 对比页的静态服务：库文件 + 分子数据
import {createServer} from 'node:http';
import {readFileSync, statSync} from 'node:fs';
import {join, normalize} from 'node:path';

const BENCH = 'E:/code/webgpu-molecular-viewer/bench';
const DATA = {
    pdb: 'E:/code/webgpu-molecular-viewer/code/backend/parsers/PDB/assets',
    sdf: 'E:/code/webgpu-molecular-viewer/code/backend/parsers/SDF/assets',
};

const PORT = Number(process.argv[2] ?? 7267);

createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/') {
        res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
        res.end(readFileSync(join(BENCH, 'compare/index.html')));
        return;
    }
    if (url.pathname === '/3Dmol-min.js') {
        res.writeHead(200, {'Content-Type': 'text/javascript; charset=utf-8'});
        res.end(readFileSync(join(BENCH, '3Dmol-min.js')));
        return;
    }
    if (url.pathname === '/data') {
        const kind = url.searchParams.get('kind');
        const file = url.searchParams.get('file') ?? '';
        const dir = DATA[kind];
        if (!dir) {
            res.writeHead(400).end('bad kind');
            return;
        }
        const path = normalize(join(dir, file));
        if (!path.startsWith(normalize(dir))) {
            res.writeHead(403).end('forbidden');
            return;
        }
        try {
            statSync(path);
        } catch {
            res.writeHead(404).end('not found');
            return;
        }
        res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'});
        res.end(readFileSync(path));
        return;
    }
    res.writeHead(404).end('not found');
}).listen(PORT, '127.0.0.1', () => console.log('COMPARE_SERVER_READY', PORT));
