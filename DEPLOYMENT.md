# YUI - Docker Deployment Guide

Complete guide for deploying YUI with Docker Compose.

## Quick Start

### 1. Edit docker-compose.yml

Update the volume mounts to point to your actual video libraries:

```yaml
services:
  yui:
    volumes:
      - ./config:/config            # Configuration directory
      - ./data:/data                # Database
      - ./thumbnails:/app/.thumbnails  # Thumbnails

      # Add your video library paths here (use :ro for read-only)
      - /actual/path/to/youtube/archive:/media/archive:ro
      - /actual/path/to/liked/videos:/media/liked:ro
```

**Important:**
- Left side (`/actual/path/...`): Your real filesystem path on the host
- Right side (`/media/...`): Container path (you'll use this in the UI)
- `:ro` makes video libraries read-only (recommended for safety)

### 2. Build and Run

```bash
# Build and start the container
docker-compose up -d --build

# Check logs
docker-compose logs -f yui
```

### 3. First-Time Setup

On first run, YUI will automatically:
1. **Run database migrations** - Creates all necessary tables
2. **Generate default config** - Creates `config/config.json` with no libraries

Then you can add libraries via the UI:

1. Open your browser and navigate to: `http://localhost:3001`
2. Go to the **Library Management** section
3. Click **"Add New Library"**
4. Add your libraries using the **container paths** (e.g., `/media/archive`)
5. Click **"Add Library"** - the config will be saved automatically

**Example:**
- If you mounted: `/home/user/videos:/media/archive:ro`
- Then add a library with path: `/media/archive`

That's it! No manual config file editing needed.

**Note:** The container will show "Running database migrations..." in the logs on first startup. This is normal and only takes a few seconds.

## Configuration Details

### Library Paths

The library paths you add in the UI must match the container mount paths:

**docker-compose.yml:**
```yaml
volumes:
  - /home/user/youtube-dl:/media/youtube:ro
```

**In the UI, add library with:**
- **Path:** `/media/youtube` (container path)
- **Name:** `YouTube Archive`
- **Type:** `channel_archive`

The config is automatically saved to `./config/config.json` on your host.

### Media Types

- `channel_archive`: Organized channel folders
- `liked_videos`: Loose video files or mixed structure

### Configuration Updates

You can update the configuration (add/edit/remove libraries) directly from the web UI:
- Navigate to **Library Management** section
- Add, edit, or toggle libraries
- Changes are automatically saved to `config.json`
- No need to restart the container!

**Note:** The `config.json` file must be writable by the container.

### Database

The database is stored in the `./data` directory on your host machine and persists across container restarts.

**Location:** `./data/yui.db`

**Migrations:** Database schema migrations run automatically when the container starts. If you update YUI and the schema has changed, migrations will be applied on the next startup.

### Thumbnails

Generated thumbnails are stored in `./thumbnails` and persist across restarts.

## Common Operations

### View Logs

```bash
docker-compose logs -f yui
```

### Restart Container

```bash
docker-compose restart yui
```

### Stop Container

```bash
docker-compose down
```

### Update YUI

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose down
docker-compose build
docker-compose up -d
```

### Backup Database

```bash
cp ./data/yui.db ./data/yui.db.backup
```

### Reset Database

```bash
# Stop container
docker-compose down

# Delete database
rm ./data/yui.db

# Restart container (will create new database)
docker-compose up -d
```

## Advanced Configuration

### Change Port

Edit `docker-compose.yml`:

```yaml
ports:
  - "8080:3001"  # Access on port 8080
```

### Resource Limits

Add resource constraints:

```yaml
services:
  yui:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

### Multiple Library Paths

Add as many volumes as you need:

```yaml
volumes:
  - /path1:/media/path1:ro
  - /path2:/media/path2:ro
  - /path3:/media/path3:ro
```

Update config.json accordingly:

```json
{
  "libraries": [
    {"path": "/media/path1", "mediaType": "channel_archive", "name": "Library 1"},
    {"path": "/media/path2", "mediaType": "liked_videos", "name": "Library 2"},
    {"path": "/media/path3", "mediaType": "channel_archive", "name": "Library 3"}
  ]
}
```

## Troubleshooting

### Container won't start

Check logs:
```bash
docker-compose logs yui
```

Common issues:
- Invalid config.json syntax
- Missing volume mounts
- Port already in use

### Can't access videos

Make sure:
1. Volume paths in docker-compose.yml are correct
2. Paths in config.json match container paths
3. Host directories exist and are readable

### Permission errors

The container runs as the `node` user. Ensure your video directories are readable:

```bash
chmod -R +r /path/to/videos
```

### Database locked

Only one instance of YUI should access the database. Stop other instances:

```bash
docker-compose down
docker-compose up -d
```

### Migration errors

If you see migration errors in the logs:

```bash
# Stop container
docker-compose down

# Check if database is corrupted
ls -lh ./data/yui.db

# If database is corrupted, backup and reset
mv ./data/yui.db ./data/yui.db.backup
docker-compose up -d

# Fresh migrations will run automatically
```

## Production Recommendations

### Use Reverse Proxy

Put YUI behind Nginx or Caddy:

**Nginx example:**
```nginx
server {
    listen 80;
    server_name yui.example.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Enable HTTPS

Use Let's Encrypt with your reverse proxy.

### Regular Backups

Set up a cron job to backup the database:

```bash
# Add to crontab
0 2 * * * cp /path/to/yui/data/yui.db /path/to/backups/yui-$(date +\%Y\%m\%d).db
```

### Monitor Logs

Use a log aggregation tool like Loki or ship logs to a monitoring service.

## Environment Variables

Available environment variables:

- `NODE_ENV`: Set to `production` (default in docker-compose)
- `CONFIG_PATH`: Path to config.json (default: `/config/config.json`)
- `DATABASE_URL`: Database connection string (default: `file:/data/yui.db`)

## Health Check

YUI includes a built-in health check endpoint:

```bash
curl http://localhost:3001/api/health
```

Docker also performs automatic health checks every 30 seconds.

## Support

For issues or questions:
- Check logs: `docker-compose logs -f yui`
- Review this guide
- Check the main README.md
