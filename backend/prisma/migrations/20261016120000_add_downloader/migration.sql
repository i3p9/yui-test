CREATE TABLE "liked_video" (
    "video_id" TEXT NOT NULL PRIMARY KEY,
    "liked_order" INTEGER,
    "first_seen_at" TEXT NOT NULL
);
CREATE INDEX "liked_video_liked_order_idx" ON "liked_video"("liked_order");
INSERT INTO "liked_video" ("video_id", "liked_order", "first_seen_at")
SELECT "video_id", "liked_order", "first_seen_at" FROM "video"
WHERE "media_type" = 'liked_videos' OR "liked_order" IS NOT NULL;

CREATE TABLE "download_settings" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
    "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "intervalHours" INTEGER NOT NULL DEFAULT 24,
    "nextRunAt" TEXT
);
INSERT INTO "download_settings" ("id") VALUES (1);

CREATE TABLE "download_source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "quality" TEXT NOT NULL DEFAULT '1080p',
    "libraryPath" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "useCookies" BOOLEAN NOT NULL DEFAULT false,
    "uploadedAfter" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL
);
CREATE UNIQUE INDEX "download_source_url_key" ON "download_source"("url");

CREATE TABLE "download_run" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT,
    "trigger" TEXT NOT NULL,
    "snapshot" TEXT NOT NULL,
    "videoKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "phase" TEXT NOT NULL DEFAULT 'preparing',
    "createdAt" TEXT NOT NULL,
    "startedAt" TEXT,
    "endedAt" TEXT,
    "exitCode" INTEGER,
    "error" TEXT,
    "publishedCount" INTEGER NOT NULL DEFAULT 0,
    "finalized" BOOLEAN NOT NULL DEFAULT false,
    "scanStatus" TEXT NOT NULL DEFAULT 'not_needed',
    "scanId" INTEGER,
    "scanError" TEXT,
    CONSTRAINT "download_run_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "download_source" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "download_run_status_createdAt_idx" ON "download_run"("status", "createdAt");
CREATE INDEX "download_run_scanStatus_idx" ON "download_run"("scanStatus");
CREATE UNIQUE INDEX "download_run_active_source" ON "download_run"("sourceId")
WHERE "status" IN ('queued', 'running', 'cancelling');
CREATE UNIQUE INDEX "download_run_active_video" ON "download_run"("videoKey")
WHERE "status" IN ('queued', 'running', 'cancelling');
