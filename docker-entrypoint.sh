#!/bin/sh
set -e

echo "======================================"
echo "🎬 YUI - YouTube Archive Browser"
echo "======================================"
echo ""

# Check if ffmpeg is available (required for thumbnail generation)
if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "⚠️  WARNING: ffmpeg not found - thumbnail generation will fail"
else
    echo "✓ ffmpeg available ($(ffmpeg -version | head -n1))"
fi

# Check if yt-dlp is available (required for metadata fetching)
if ! command -v yt-dlp >/dev/null 2>&1; then
    echo "⚠️  WARNING: yt-dlp not found - metadata fetching will fail"
else
    echo "✓ yt-dlp available ($(yt-dlp --version))"
fi

# Check if config exists
if [ -n "$CONFIG_PATH" ] && [ -f "$CONFIG_PATH" ]; then
    echo "✓ Config file found at: $CONFIG_PATH"
else
    echo "ℹ️  Config will be created from defaults"
fi

# Run database migrations
echo ""
echo "🔄 Running database migrations..."
if pnpm prisma migrate deploy; then
    echo "✓ Database migrations complete"
else
    echo "❌ Database migration failed!"
    exit 1
fi

# Generate Prisma Client (in case schema changed)
echo ""
echo "🔄 Generating Prisma Client..."
if pnpm prisma generate; then
    echo "✓ Prisma Client ready"
else
    echo "❌ Prisma Client generation failed!"
    exit 1
fi

echo ""
echo "======================================"
echo "🚀 Starting application..."
echo "======================================"
echo ""

# Start the application
exec node dist/index.js
