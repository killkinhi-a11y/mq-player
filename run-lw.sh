#!/bin/bash
while true; do
  cd /home/z/my-project
  node lightweight-server.js 2>&1
  sleep 2
done
