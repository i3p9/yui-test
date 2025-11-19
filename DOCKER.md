# 🐳 Docker Deployment Guide

This guide explains how to deploy YUI using Docker on a new machine.

## 📋 Prerequisites

- Docker installed
- Docker Compose installed
- Your video library accessible on the host machine

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd yui
```

### 2. Configure Your Library Paths

Edit `docker-compose.yml` and update the volume mounts to point to your actual video libraries:

```yaml
volumes:
  # Map your video library to /media in the container
  - /path/to/your/videos:/media:ro

  # For multiple libraries, add more volumes:
  # - /path/to/liked/videos:/media/liked:ro
```

### 3. Configure the Application

Edit `config/config.json` to match your mounted paths:

```json
{
  "libraries": [
    {
      "path": "/media/channels",
      "name": "Main Archive",
      "mediaType": "channel_archive",
      "skip": false
    }
  ]
}
```

**Note**: Use the paths as they appear **inside** the container (e.g., `/media/channels`), not the host paths.

### 4. Build and Start

```bash
# Build the Docker image
docker-compose build

# Start the container
docker-compose up -d

# View logs
docker-compose logs -f
```

### 5. Access the Application

Open your browser and navigate to:
```
http://localhost:3001
```

## 📁 Directory Structure

The Docker setup creates these directories on your host:

```
yui/
├── config/           # Application configuration (editable)
│   └── config.json
├── data/            # SQLite database (auto-created)
│   └── yui.db
└── thumbnails/      # Generated thumbnails (auto-created)
    └── {videoId}/
        ├── thumb_small.jpg
        └── thumb_large.jpg
```

## 🔄 Database Migrations

**Good news**: Migrations run automatically on container startup!

The `docker-entrypoint.sh` script:
1. ✅ Runs `prisma migrate deploy` to apply any pending migrations
2. ✅ Regenerates Prisma Client if needed
3. ✅ Starts the application

### On a Fresh Install

When you start the container for the first time:
- All migrations in `backend/prisma/migrations/` run in order
- Database is created at `/data/yui.db` (persisted on host)
- Ready to use!

### After Pulling New Code

```bash
# Pull latest changes (includes new migration files)
git pull

# Rebuild and restart container
docker-compose down
docker-compose build
docker-compose up -d

# Migrations run automatically on startup
docker-compose logs -f
```

You'll see output like:
```
🔄 Running database migrations...
Applying migration `20251112030128_init`
Applying migration `20251119224043_add_thumbnail_tracking`
✓ Database migrations complete
🚀 Starting application...
```

## 🖼️ Thumbnail Generation

The Docker image includes **ffmpeg** for thumbnail generation.

On startup, the entrypoint script checks:
```
✓ ffmpeg available (ffmpeg version 6.0)
```

Thumbnails are generated automatically during scans:
- **From original images**: Resizes existing `.webp`, `.jpg`, `.png` files
- **From video frames**: Extracts frames using ffmpeg if no thumbnail exists

## ⚙️ Configuration

### Environment Variables

You can customize these in `docker-compose.yml`:

```yaml
environment:
  - NODE_ENV=production
  - CONFIG_PATH=/config/config.json         # Path to config file
  - DATABASE_URL=file:/data/yui.db          # Database location
  - NODE_OPTIONS=--max-old-space-size=4096  # Increase memory for large libraries
```

### Config File Options

Edit `config/config.json`:

```json
{
  "libraries": [
    {
      "path": "/media/channels",      // Path inside container
      "name": "Main Archive",         // Display name
      "mediaType": "channel_archive", // or "liked_videos"
      "skip": false                   // Set true to skip scanning
    }
  ],
  "thumbnailDir": "/app/.thumbnails", // Where to store generated thumbnails
  "databaseUrl": "file:/data/yui.db", // Database path (matches volume)
  "scanOptions": {
    "parallelism": 4,                 // Concurrent file scans
    "followSymlinks": false,          // Follow symbolic links?
    "generateThumbnails": true,       // Auto-generate thumbnails?
    "thumbnailConcurrency": 2         // Concurrent ffmpeg processes
  }
}
```

## 🔧 Troubleshooting

### Check Container Logs

```bash
docker-compose logs -f
```

### Migration Failed?

If migrations fail on startup:

```bash
# Check migration logs
docker-compose logs yui | grep -A 10 "migration"

# Try manual migration
docker-compose exec yui pnpm prisma migrate deploy
```

### Database Issues

Reset the database (⚠️ **deletes all data**):

```bash
docker-compose down
rm -rf data/yui.db
docker-compose up -d
```

### Thumbnail Generation Not Working?

Check if ffmpeg is available:

```bash
docker-compose exec yui ffmpeg -version
```

### Permission Issues

Ensure Docker has read access to your video library:

```bash
# On Linux, you may need to set permissions
chmod -R 755 /path/to/your/videos

# Or run container as specific user
docker-compose run --user $(id -u):$(id -g) yui
```

## 🔄 Updates and Maintenance

### Update to Latest Version

```bash
# Pull latest code
git pull

# Rebuild image
docker-compose build

# Restart with new image
docker-compose down
docker-compose up -d
```

### Backup Your Data

```bash
# Backup database
cp data/yui.db data/yui.db.backup

# Backup config
cp config/config.json config/config.json.backup

# Backup is optional - thumbnails can be regenerated
tar -czf thumbnails-backup.tar.gz thumbnails/
```

### View Resource Usage

```bash
# Container stats
docker stats yui

# Disk usage
docker system df
```

## 🎯 Production Recommendations

### 1. Use Named Volumes (Optional)

For better portability:

```yaml
volumes:
  - yui-data:/data
  - yui-thumbnails:/app/.thumbnails
  - yui-config:/config

volumes:
  yui-data:
  yui-thumbnails:
  yui-config:
```

### 2. Set Resource Limits

```yaml
deploy:
  resources:
    limits:
      cpus: '2.0'
      memory: 4G
    reservations:
      cpus: '1.0'
      memory: 2G
```

### 3. Use Reverse Proxy

For HTTPS and domain access:

```nginx
# nginx.conf
server {
    listen 443 ssl;
    server_name yui.example.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 4. Schedule Automatic Scans

Use cron to trigger scans:

```bash
# crontab -e
0 2 * * * docker-compose exec -T yui curl -X POST http://localhost:3001/api/scan
```

## 📚 Additional Resources

- [Prisma Migrations Guide](https://www.prisma.io/docs/guides/migrate)
- [Docker Compose Reference](https://docs.docker.com/compose/)
- [FFmpeg Documentation](https://ffmpeg.org/documentation.html)

## 🆘 Getting Help

If you encounter issues:

1. Check logs: `docker-compose logs -f`
2. Verify config: `cat config/config.json`
3. Test health: `curl http://localhost:3001/api/health`
4. Check migrations: `docker-compose exec yui pnpm prisma migrate status`

Happy archiving! 🎬
