// ============================================
// DATABASE CLIENT
// ============================================
// Singleton Prisma client instance

import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: ['error', 'warn'], // Only log errors and warnings
    });
  }
  return prisma;
}

/**
 * Switch SQLite to write-ahead logging. Each commit then needs one disk sync instead
 * of several (a big difference on spinning disks) and readers no longer block the
 * scanner's writes. The mode is stored in the database file, so this is a no-op
 * after the first start. If the filesystem can't support WAL, SQLite keeps the
 * current mode and we carry on.
 */
export async function enableWalMode(): Promise<string> {
  try {
    const [row] = await getPrismaClient().$queryRawUnsafe<{ journal_mode: string }[]>('PRAGMA journal_mode=WAL');
    return row?.journal_mode ?? 'unknown';
  } catch (error) {
    console.warn('Could not enable SQLite WAL mode; continuing with the default journal:', error);
    return 'unchanged';
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
