#!/usr/bin/env node
// Test-only adapter: run the real yt-dlp against locally generated format metadata.
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
if (args.includes('-o')) {
  if (!process.env.YUI_LOCAL_INFO) throw new Error('Isolated local fixture required');
  args.splice(-2, 2, '--load-info-json', process.env.YUI_LOCAL_INFO);
}
const result = spawnSync(process.env.YUI_REAL_YTDLP || 'yt-dlp', args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
