// ============================================
// MIGRATION SERVICE
// ============================================
// Handles database migrations including FTS5 setup

import { getPrismaClient } from '../lib/database.js';

export class MigrationService {
  private prisma = getPrismaClient();

  /**
   * Run all necessary migrations
   */
  async runMigrations(): Promise<void> {
    console.log('🔄 Running database migrations...');
    
    try {
      await this.setupFTS5();
      console.log('✅ All migrations completed successfully');
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  /**
   * Set up FTS5 virtual tables for search
   */
  async setupFTS5(): Promise<void> {
    console.log('🔍 Setting up FTS5 search tables...');

    // Check if FTS5 tables already exist
    const existingVideosFts = await this.checkTableExists('videos_fts');
    const existingChannelsFts = await this.checkTableExists('channels_fts');

    if (existingVideosFts && existingChannelsFts) {
      console.log('📝 FTS5 tables already exist, skipping creation');
      return;
    }

    // Create FTS5 virtual table for videos
    await this.prisma.$executeRawUnsafe(`
      CREATE VIRTUAL TABLE IF NOT EXISTS videos_fts USING fts5(
        video_id,
        title,
        uploader,
        description,
        content='video',
        content_rowid='rowid'
      )
    `);

    // Create FTS5 virtual table for channels
    await this.prisma.$executeRawUnsafe(`
      CREATE VIRTUAL TABLE IF NOT EXISTS channels_fts USING fts5(
        uploader_id,
        name,
        content='channel',
        content_rowid='rowid'
      )
    `);

    // Populate videos_fts with existing data
    console.log('📚 Populating videos FTS5 table...');
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO videos_fts(rowid, video_id, title, uploader, description)
      SELECT rowid, video_id, title, COALESCE(uploader, ''), COALESCE(description, '')
      FROM video 
      WHERE missing_on_disk = false
    `);

    // Populate channels_fts with existing data
    console.log('👥 Populating channels FTS5 table...');
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO channels_fts(rowid, uploader_id, name)
      SELECT rowid, uploader_id, name
      FROM channel
    `);

    console.log('✅ FTS5 setup completed');
  }

  /**
   * Check if a table exists in the database
   */
  private async checkTableExists(tableName: string): Promise<boolean> {
    try {
      const result = await this.prisma.$queryRawUnsafe<[{ count: number }]>(`
        SELECT COUNT(*) as count 
        FROM sqlite_master 
        WHERE type='table' AND name=?
      `, tableName);
      
      const count = result[0]?.count || 0;
      return (typeof count === 'bigint' ? Number(count) : count) > 0;
    } catch {
      return false;
    }
  }

  /**
   * Rebuild FTS5 tables (useful for data corruption recovery)
   */
  async rebuildFTS5(): Promise<void> {
    console.log('🔄 Rebuilding FTS5 tables...');
    
    // Drop existing tables
    await this.prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS videos_fts`);
    await this.prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS channels_fts`);
    
    // Recreate them
    await this.setupFTS5();
    
    console.log('✅ FTS5 rebuild completed');
  }

  /**
   * Sync FTS5 tables with current data (useful after bulk operations)
   */
  async syncFTS5(): Promise<void> {
    console.log('🔄 Syncing FTS5 tables with current data...');

    // Clear existing FTS5 data
    await this.prisma.$executeRawUnsafe(`DELETE FROM videos_fts`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM channels_fts`);

    // Repopulate
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO videos_fts(rowid, video_id, title, uploader, description)
      SELECT rowid, video_id, title, COALESCE(uploader, ''), COALESCE(description, '')
      FROM video 
      WHERE missing_on_disk = false
    `);

    await this.prisma.$executeRawUnsafe(`
      INSERT INTO channels_fts(rowid, uploader_id, name)
      SELECT rowid, uploader_id, name
      FROM channel
    `);

    console.log('✅ FTS5 sync completed');
  }
}