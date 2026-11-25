#!/usr/bin/env node
// Fake yt-dlp for channel image tests: writes avatar/banner into cwd after a short
// delay and logs start/end times so tests can check how many ran at once.
import { appendFileSync, writeFileSync } from 'node:fs';
const url = process.argv.at(-1), id = url.split('/').pop();
appendFileSync(process.env.FAKE_CHANNEL_LOG, `start ${Date.now()}\n`);
await new Promise(r => setTimeout(r, 300));
writeFileSync(`${id} - Videos [${id}].avatar_uncropped.jpg`, 'a');
writeFileSync(`${id} - Videos [${id}].banner_uncropped.jpg`, 'b');
appendFileSync(process.env.FAKE_CHANNEL_LOG, `end ${Date.now()}\n`);
