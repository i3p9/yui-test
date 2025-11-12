#!/bin/sh
set -e

echo "🔄 Running database migrations..."
pnpm prisma migrate deploy

echo "✓ Database ready"
echo "🚀 Starting YUI..."

# Start the application
exec node dist/index.js
