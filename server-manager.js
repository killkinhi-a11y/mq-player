const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');

const LOG = '/tmp/mq-server.log';
const PORT = 3000;

function log(msg) {
  const ts = new Date().toISOString();
  fs.appendFileSync('/tmp/mq-manager.log', `${ts} ${msg}\n`);
}

function isPortFree(cb) {
  const s = net.createServer();
  s.once('error', () => cb(false));
  s.once('listening', () => { s.close(); cb(true); });
  s.listen(PORT, '::');
}

function startServer() {
  log('Starting server...');
  const child = spawn('node', ['.next/standalone/server.js'], {
    cwd: '/home/z/my-project',
    env: {
      ...process.env,
      HOSTNAME: '::',
      NODE_ENV: 'production',
      NODE_OPTIONS: '--max-old-space-size=2048',
      PORT: String(PORT),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', d => fs.appendFileSync(LOG, d.toString()));
  child.stderr.on('data', d => fs.appendFileSync(LOG, d.toString()));
  
  child.on('exit', (code, signal) => {
    log(`Server exited: code=${code} signal=${signal}`);
    setTimeout(checkAndStart, 2000);
  });
  
  child.on('error', (err) => {
    log(`Server error: ${err.message}`);
    setTimeout(checkAndStart, 2000);
  });
}

function checkAndStart() {
  isPortFree((free) => {
    if (free) {
      startServer();
    } else {
      log('Port in use, waiting...');
      setTimeout(checkAndStart, 3000);
    }
  });
}

// Prevent process from exiting
process.on('uncaughtException', (e) => log(`Uncaught: ${e.message}`));
process.on('unhandledRejection', (e) => log(`Rejection: ${e}`));

log('Manager started');
checkAndStart();
