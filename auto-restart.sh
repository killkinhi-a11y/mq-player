#!/bin/bash
# Kill any existing server
pkill -f "node.*server" 2>/dev/null
pkill -f "bun.*server" 2>/dev/null
sleep 1
cd /home/z/my-project/.next/standalone
exec PORT=3000 node server.js
