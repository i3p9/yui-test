-- CreateTable
CREATE TABLE "video" (
    "video_id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "uploader" TEXT,
    "uploader_id" TEXT,
    "upload_date" TEXT,
    "duration_seconds" INTEGER,
    "filesize_bytes" BIGINT,
    "description" TEXT,
    "tags" TEXT,
    "media_type" TEXT NOT NULL,
    "library_path" TEXT NOT NULL,
    "video_path" TEXT NOT NULL,
    "thumbnail_path" TEXT,
    "generated_thumbnail" TEXT,
    "resolution" TEXT,
    "video_codec" TEXT,
    "audio_codec" TEXT,
    "has_complete_metadata" BOOLEAN NOT NULL DEFAULT false,
    "metadata_source" TEXT NOT NULL,
    "info_json_mtime" TEXT,
    "media_mtime" TEXT,
    "missing_on_disk" BOOLEAN NOT NULL DEFAULT false,
    "first_seen_at" TEXT NOT NULL,
    "last_scanned_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "subtitle" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "video_id" TEXT NOT NULL,
    "language" TEXT,
    "kind" TEXT,
    "path" TEXT NOT NULL,
    "filesize_bytes" INTEGER,
    CONSTRAINT "subtitle_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "video" ("video_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "channel" (
    "uploader_id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "thumbnail_path" TEXT,
    "video_count" INTEGER NOT NULL DEFAULT 0,
    "last_upload_date" TEXT,
    "last_scanned_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "watch_progress" (
    "video_id" TEXT NOT NULL PRIMARY KEY,
    "position_seconds" INTEGER NOT NULL,
    "duration_seconds" INTEGER,
    "last_watched_at" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "watch_progress_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "video" ("video_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "scan_log" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "started_at" TEXT NOT NULL,
    "ended_at" TEXT,
    "status" TEXT NOT NULL,
    "library_path" TEXT,
    "mode" TEXT NOT NULL,
    "videos_scanned" INTEGER NOT NULL DEFAULT 0,
    "videos_added" INTEGER NOT NULL DEFAULT 0,
    "videos_updated" INTEGER NOT NULL DEFAULT 0,
    "videos_removed" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT
);

-- CreateIndex
CREATE INDEX "video_uploader_idx" ON "video"("uploader");

-- CreateIndex
CREATE INDEX "video_upload_date_idx" ON "video"("upload_date");

-- CreateIndex
CREATE INDEX "video_media_type_idx" ON "video"("media_type");

-- CreateIndex
CREATE INDEX "video_missing_on_disk_idx" ON "video"("missing_on_disk");

-- CreateIndex
CREATE INDEX "subtitle_video_id_idx" ON "subtitle"("video_id");
