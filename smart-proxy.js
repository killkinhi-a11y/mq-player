const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = 3000;
const NEXT = 3001;

const MIME = {'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.png':'image/png','.ico':'image/x-icon','.svg':'image/svg+xml','.webp':'image/webp','.mp3':'audio/mpeg','.jpg':'image/jpeg','.woff':'font/woff','.ts':'text/typescript','.tsx':'text/typescript','.map':'application/json'};

const STATIC = path.join('/home/z/my-project/.next/standalone');
const PUBLIC = path.join(STATIC, 'public');
const NX_STATIC = path.join(STATIC, '.next/static');
const NX_SERVER = path.join(STATIC, '.next/server');

// Serve static files directly (fast, no proxy needed)
function serveStatic(req, res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, data) => {
    if (err) return false;
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    res.end(data);
    return true;
  });
}

let active = 0;
const queue = [];

function proxyToNext(req, res, body) {
  const run = () => {
    active++;
    const pr = http.request({hostname:'127.0.0.1',port:NEXT,path:req.url,method:req.method,headers:{...req.headers,host:'localhost:'+NEXT}}, (prs) => {
      res.writeHead(prs.statusCode, prs.headers);
      prs.pipe(res);
      prs.on('end', () => { active--; drain(); });
      prs.on('error', () => { if (!res.headersSent) { res.writeHead(502); res.end(); } active--; drain(); });
    });
    pr.on('error', () => { if (!res.headersSent) { res.writeHead(502); res.end(); } active--; drain(); });
    if (body && body.length) pr.write(body);
    pr.end();
  };
  if (active < 2) run(); else queue.push(run);
}
function drain() { while (queue.length && active < 2) { active++; queue.shift()(); } }

http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  
  // 1. Static JS/CSS/fonts from .next/static
  if (url.startsWith('/_next/static/')) {
    const fp = path.join(STATIC, url);
    if (serveStatic(req, res, fp)) return;
  }
  
  // 2. Public files (favicon, manifest, etc.)
  const pubPath = path.join(PUBLIC, url);
  if (serveStatic(req, res, pubPath)) return;
  
  // 3. Workbox SW and chunks
  if (url.startsWith('/_next/')) {
    // Try multiple locations
    const tryPaths = [
      path.join(NX_STATIC, url.replace('/_next/', '')),
      path.join(NX_SERVER, url.replace('/_next/', '')),
      path.join(STATIC, '.next', url.replace('/_next/', '')),
    ];
    tryServe(0);
    function tryServe(i) {
      if (i >= tryPaths.length) { res.writeHead(404); res.end(); return; }
      fs.readFile(tryPaths[i], (err, data) => {
        if (err) { tryServe(i + 1); return; }
        const ext = path.extname(tryPaths[i]).toLowerCase();
        res.writeHead(200, {'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable'});
        res.end(data);
      });
    }
    return;
  }
  
  // 4. API routes - proxy to Next.js (serialized)
  if (url.startsWith('/api/')) {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => proxyToNext(req, res, Buffer.concat(chunks)));
    return;
  }
  
  // 5. Page routes - proxy to Next.js (serialized)
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => proxyToNext(req, res, Buffer.concat(chunks)));
}).listen(PORT, '0.0.0.0', () => {
  console.log('Smart proxy on :' + PORT + ' -> static files + Next.js :' + NEXT + ' (max 2 API/HTML concurrent)');
});
