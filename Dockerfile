# ============================================
# Build Stage 1: Frontend
# ============================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package.json frontend/pnpm-lock.yaml ./

# Install pnpm and dependencies
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile

# Copy frontend source
COPY frontend/ ./

# Build frontend
RUN pnpm build

# ============================================
# Build Stage 2: Backend
# ============================================
FROM node:20-alpine AS backend-builder

WORKDIR /app/backend

# Copy backend package files
COPY backend/package.json backend/pnpm-lock.yaml ./
COPY backend/prisma ./prisma/

# Install pnpm and dependencies
RUN corepack enable && corepack prepare pnpm@latest --activate
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
FROM node:20-alpine

WORKDIR /app

# Install system dependencies
# - ffmpeg: Required for thumbnail generation from videos
RUN apk add --no-cache ffmpeg

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy backend package files
COPY backend/package.json backend/pnpm-lock.yaml ./
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
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run migrations and start application
ENTRYPOINT ["docker-entrypoint.sh"]
