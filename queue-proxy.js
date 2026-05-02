const http = require('http');
const PORT = parseInt(process.env.PORT, 10) || 3000;
const NEXT_PORT = 3001;
const MAX_CONCURRENT = 1;
let active = 0;
const queue = [];
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const run = () => {
      active++;
      const pr = http.request({hostname:'127.0.0.1',port:NEXT_PORT,path:req.url,method:req.method,headers:{...req.headers,host:'localhost:'+NEXT_PORT}}, (prs) => {
        res.writeHead(prs.statusCode, prs.headers);
        prs.pipe(res);
        prs.on('end', () => { active--; drain(); });
        prs.on('error', () => { active--; drain(); });
      });
      pr.on('error', () => { res.writeHead(502); res.end(); active--; drain(); });
      if (body.length) pr.write(body);
      pr.end();
    };
    if (active < MAX_CONCURRENT) run();
    else queue.push(run);
  });
});
function drain() { while (queue.length && active < MAX_CONCURRENT) { active++; queue.shift()(); } }
server.listen(PORT, '0.0.0.0', () => console.log('Proxy :' + PORT + ' -> :' + NEXT_PORT + ' (max ' + MAX_CONCURRENT + ')'));
