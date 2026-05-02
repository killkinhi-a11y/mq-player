const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PID_FILE = '/tmp/mq-daemon.pid';
const LOG_FILE = '/tmp/mq-daemon.log';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
}

// Check if already running
try {
  const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf8'));
  if (oldPid && process.kill(oldPid, 0)) {
    log('Already running as PID ' + oldPid);
    process.exit(0);
  }
} catch {}

// Write PID
fs.writeFileSync(PID_FILE, process.pid.toString());
log('Daemon started, PID: ' + process.pid);

function startServer() {
  const child = spawn('node', ['server.js', '-H', '0.0.0.0'], {
    cwd: '/home/z/my-project/.next/standalone',
    detached: false,
    stdio: ['ignore', fs.openSync(LOG_FILE, 'a'), fs.openSync(LOG_FILE, 'a')],
    env: { ...process.env, PORT: '3001', NODE_OPTIONS: '--max-old-space-size=4096' }
  });
  
  log('Server spawned, PID: ' + child.pid);
  
  child.on('exit', (code) => {
    log('Server exited: ' + code);
    setTimeout(startServer, 3000);
  });
  
  child.on('error', (err) => {
    log('Server error: ' + err.message);
    setTimeout(startServer, 3000);
  });
}

startServer();

// Keep daemon alive
setInterval(() => {
  try { fs.writeFileSync(PID_FILE, process.pid.toString()); } catch {}
}, 10000);

// Don't exit
process.on('SIGTERM', () => { log('Daemon SIGTERM'); process.exit(1); });
process.on('SIGHUP', () => { log('Daemon SIGHUP - ignoring'); });
process.on('SIGINT', () => { log('Daemon SIGINT'); process.exit(1); });
