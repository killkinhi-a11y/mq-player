const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = '/home/z/my-project/.next/standalone';
const PORT = 3000;

const MIME = {'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.png':'image/png','.ico':'image/x-icon','.svg':'image/svg+xml','.webp':'image/webp','.mp3':'audio/mpeg','.wav':'audio/wav','.jpg':'image/jpeg','.jpeg':'image/jpeg'};

http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/') url = '/play.html';
  
  // Serve static files from standalone directory
  let filePath;
  if (url.startsWith('/_next/')) {
    filePath = path.join(ROOT, url);
  } else {
    filePath = path.join(ROOT, 'public', url);
  }
  
  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Try play.html for unknown routes
      fs.readFile(path.join(ROOT, 'public', 'play.html'), (e2, d2) => {
        if (e2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, {'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-cache'});
        res.end(d2);
      });
      return;
    }
    res.writeHead(200, {'Content-Type': MIME[ext] || 'application/octet-stream'});
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => console.log('Static server on :' + PORT));
