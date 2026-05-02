#!/bin/bash
cd /home/z/my-project/.next/standalone
exec setsid env PORT=3000 node server.js
