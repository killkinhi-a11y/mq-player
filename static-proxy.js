const express = require('express');
const http = require('http');
const path = require('path');
const app = express();
const API = 3001;

app.use('/_next/static', express.static(path.join('/home/z/my-project/.next/standalone', '.next/static'), {maxAge:'365d',immutable:true}));
app.use(express.static(path.join('/home/z/my-project/.next/standalone', 'public'), {maxAge:'1d'}));
app.use((req, res) => {
  const pr = http.request({hostname:'127.0.0.1',port:API,path:req.originalUrl,method:req.method,headers:{...req.headers,host:'localhost:'+API}}, (prs) => {
    res.writeHead(prs.statusCode, prs.headers);
    prs.pipe(res);
  });
  pr.on('error', () => res.status(502).send('Next.js unavailable'));
  req.pipe(pr);
});
app.listen(3000, '0.0.0.0', () => console.log('Express :3000 -> Next.js :3001'));
