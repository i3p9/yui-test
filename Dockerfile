# ============================================
# Build Stage 1: Frontend
# ============================================
FROM node:24-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./

# Install pnpm and dependencies
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
RUN pnpm install --frozen-lockfile

# Copy frontend source
COPY frontend/ ./

# Build frontend
RUN pnpm build

# ============================================
# Build Stage 2: Backend
# ============================================
FROM node:24-alpine AS backend-builder

WORKDIR /app/backend

# Copy backend package files
COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml ./
COPY backend/prisma ./prisma/

# Install pnpm and dependencies
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
RUN pnpm install --frozen-lockfile

# Generate Prisma Client
RUN pnpm prisma generate

# Copy backend source
COPY backend/ ./

# Build backend
RUN pnpm build

# ============================================
# Production Stage
# ============================================
FROM node:24-alpine

WORKDIR /app

# Install system dependencies
# - ffmpeg: Required for thumbnail generation from videos
# - yt-dlp: Downloads and metadata. Deliberately unpinned: YouTube changes often, so the
#   image installs the latest release and the entrypoint updates it on start and daily.
#   [default] includes the matching yt-dlp-ejs; Node is used as its JS runtime.
# - python3: Required by yt-dlp
RUN apk add --no-cache ffmpeg python3 py3-pip \
    && python3 -m venv /opt/yt-dlp \
    && /opt/yt-dlp/bin/pip install --no-cache-dir --upgrade 'yt-dlp[default]'
ENV PATH="/opt/yt-dlp/bin:${PATH}"

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate

# Copy backend package files
COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml ./
COPY backend/prisma ./prisma/

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Generate Prisma Client in production
RUN pnpm prisma generate

# Copy built backend from builder
COPY --from=backend-builder /app/backend/dist ./dist

# Copy built frontend from builder
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create directories for volumes
RUN mkdir -p /data /config

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run migrations and start application
ENTRYPOINT ["docker-entrypoint.sh"]
