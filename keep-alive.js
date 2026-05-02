const { spawn } = require('child_process');
const fs = require('fs');
const logFile = '/tmp/mq-keeper.log';

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}\n`;
  fs.appendFileSync(logFile, line);
}

function start() {
  const net = require('net');
  const tester = net.createServer()
    .once('error', () => { tester.close(); setTimeout(start, 2000); })
    .once('listening', () => {
      tester.close();
      
      log('Starting MQ Player production server...');
      const child = spawn('node', ['server.js', '-H', '0.0.0.0', '-p', '3000'], {
        cwd: '/home/z/my-project/.next/standalone',
        stdio: ['ignore', fs.openSync(logFile, 'a'), fs.openSync(logFile, 'a')],
        env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' }
      });
      
      child.on('exit', (code, signal) => {
        log(`Server exited: code=${code} signal=${signal}`);
        setTimeout(start, 2000);
      });
      
      child.on('error', (err) => {
        log(`Spawn error: ${err.message}`);
        setTimeout(start, 2000);
      });
    })
    .listen(3000);
}

log('MQ Player keeper starting');
start();
