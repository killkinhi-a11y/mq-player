#!/bin/bash
cd /home/z/my-project/.next/standalone
while true; do
  node server.js 2>&1
  sleep 2
done
