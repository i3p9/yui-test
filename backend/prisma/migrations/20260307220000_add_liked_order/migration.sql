-- AlterTable: Add liked_order column to video table
-- This stores the chronological like order for liked_videos media type.
-- NULL = order unknown (non-liked videos, or liked videos added before the
-- order import feature existed). NULLs sort last in the UI.
ALTER TABLE "video" ADD COLUMN "liked_order" INTEGER;

-- Index for efficient ORDER BY liked_order queries on the liked videos page
CREATE INDEX "video_liked_order_idx" ON "video"("liked_order");
