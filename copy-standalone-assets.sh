#!/bin/bash
# Copy static assets to standalone directory (required for standalone mode)
cd /home/z/my-project
echo "Copying static files to standalone..."
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public 2>/dev/null
echo "Done. $(ls .next/standalone/.next/static/chunks/ | wc -l) chunk files copied."
