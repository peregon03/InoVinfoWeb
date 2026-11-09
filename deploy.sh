#!/bin/bash
set -e

echo "=== InovInfo Deploy ==="
echo "$(date)"

# Pull latest code
echo ">> git pull..."
git pull

# Build web
echo ">> Building web..."
cd web
npm ci
npm run build
cd ..

# Install backend deps
echo ">> Installing backend dependencies..."
cd backend
npm install
cd ..

# Restart PM2
echo ">> Restarting PM2..."
pm2 restart inovinfo

echo "=== Deploy complete ==="
echo "Health check: curl https://api.electroinova.com/health"
