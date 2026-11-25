// Run from the repository root. Install Playwright in /tmp/yui-browser-tooling, or set PLAYWRIGHT_MODULE.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/tmp/yui-browser-tooling/node_modules/playwright/index.mjs');
const server = spawn(process.execPath, ['--import', 'tsx', 'tests/fixtures/download-browser-server.ts'], {
  cwd: resolve('backend'), stdio: ['ignore', 'pipe', 'pipe'], env: process.env,
});
let browser;
try {
  const setup = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Browser fixture startup timed out: ' + output.slice(-3000))), 20_000);
    server.stdout.on('data', chunk => {
      output += chunk;
      const match = /YUI_BROWSER_READY:(.+)/.exec(output);
      if (match) { clearTimeout(timer); resolve(JSON.parse(match[1])); }
    });
    server.stderr.on('data', chunk => { output += chunk; });
    server.once('exit', code => { clearTimeout(timer); reject(new Error('Browser fixture exited ' + code + ': ' + output.slice(-3000))); });
  });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  await page.goto(setup.url + '/downloads');
  await page.getByRole('heading', { name: 'DOWNLOADS', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Add source', exact: true }).click();
  const form = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Add source', exact: true }) });
  await form.getByLabel('Name', { exact: true }).fill('Browser channel');
  await form.getByLabel('YouTube URL', { exact: true }).fill('https://www.youtube.com/@browser-test');
  await form.getByLabel('Quality', { exact: true }).selectOption('720p');
  await form.getByLabel('Download history', { exact: true }).selectOption('date');
  await form.getByLabel('Upload date', { exact: true }).fill('2020-01-01');
  await form.getByRole('button', { name: 'Save source' }).click();
  await page.getByRole('heading', { name: 'Browser channel', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Run now', exact: true }).click();
  await page.getByText('Library scan: complete', { exact: true }).waitFor({ timeout: 15_000 });
  const state = await (await page.request.get(setup.url + '/api/downloads/runs')).json();
  assert.equal(state.runs[0].status, 'succeeded'); assert.equal(state.runs[0].publishedCount, 1);
  const schedule = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Automatic downloads' }) });
  await schedule.getByLabel('Enable download schedule').check();
  await schedule.getByLabel('Interval (hours)').fill('48');
  await schedule.getByRole('button', { name: 'Save schedule' }).click();
  await page.getByText('Download schedule saved', { exact: true }).waitFor();
  await page.reload();
  await page.getByLabel('Interval (hours)').waitFor();
  assert.equal(await page.getByLabel('Interval (hours)').inputValue(), '48');
  const oneoff = page.locator('form').filter({ has: page.getByLabel('Video URL', { exact: true }) });
  await oneoff.getByLabel('Video URL', { exact: true }).fill('https://www.youtube.com/watch?v=bbbbbbbbbbb&list=PL123');
  await oneoff.getByLabel('Video destination').selectOption(setup.library);
  await oneoff.getByRole('button', { name: 'Queue video' }).click();
  await page.getByText('Video queued', { exact: true }).waitFor();
  await page.getByText('Library scan: complete', { exact: true }).nth(1).waitFor({ timeout: 15000 });
  await page.getByLabel('Upload Netscape cookies file', { exact: false }).setInputFiles({ name: 'test-cookies.txt', mimeType: 'text/plain',
    buffer: Buffer.from('# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\ttest\tprivate-browser-fixture\n') });
  await page.getByText('Cookies saved privately', { exact: true }).waitFor();
  assert.ok(!(await page.content()).includes('private-browser-fixture'));
  await page.getByRole('button', { name: 'Add source', exact: true }).click();
  await form.getByLabel('Name', { exact: true }).fill('Browser likes');
  await form.getByLabel('Source type', { exact: true }).selectOption('liked');
  await form.getByLabel('Quality', { exact: true }).selectOption('best');
  await form.getByRole('button', { name: 'Save source' }).click();
  const likedSource = page.locator('section[aria-labelledby="sources-title"] article').filter({ has: page.getByRole('heading', { name: 'Browser likes', exact: true }) });
  await likedSource.getByRole('button', { name: 'Run now', exact: true }).click();
  await likedSource.getByText(/Last: succeeded/).waitFor({ timeout: 15000 });
  const liked = await (await page.request.get(setup.url + '/api/library/liked')).json();
  assert.equal(liked.pagination.total, 2);
  assert.ok(liked.videos.every(video => video.mediaType === 'channel_archive'));
  await page.request.post(setup.url + '/api/test/scenario', { data: { mode: 'partial' } });
  await oneoff.getByLabel('Video URL', { exact: true }).fill('https://www.youtube.com/watch?v=ccccccccccc');
  await oneoff.getByRole('button', { name: 'Queue video' }).click();
  await page.getByText('partial', { exact: true }).waitFor({ timeout: 15000 });
  await page.request.post(setup.url + '/api/test/scenario', { data: { mode: 'hang' } });
  await oneoff.getByLabel('Video URL', { exact: true }).fill('https://www.youtube.com/watch?v=ddddddddddd');
  await oneoff.getByRole('button', { name: 'Queue video' }).click();
  await page.getByText(/running · downloading/i).waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Cancel', exact: true }).first().click();
  await page.getByText('cancelled', { exact: true }).waitFor({ timeout: 15000 });
  await page.request.post(setup.url + '/api/test/scenario', { data: { mode: 'success' } });
  await page.getByLabel('Import destination', { exact: true }).selectOption(setup.library);
  await page.getByLabel('720p source list', { exact: true }).setInputFiles({ name: 'sources.txt', mimeType: 'text/plain', buffer: Buffer.from('https://www.youtube.com/@imported-browser\n') });
  await page.getByRole('button', { name: 'Preview import' }).click();
  await page.getByText('1 new sources', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Apply import' }).click();
  await page.getByText('Imported 1 sources', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'View log' }).first().click();
  await page.getByRole('heading', { name: 'Run log', exact: true }).waitFor();
  // Error recovery preserves form values.
  await oneoff.getByLabel('Video URL', { exact: true }).fill('https://www.youtube.com/watch?v=ccccccccccc');
  await page.route('**/api/downloads/videos', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Test service unavailable"}' }));
  await oneoff.getByRole('button', { name: 'Queue video' }).click();
  await page.getByRole('alert').filter({ hasText: 'Test service unavailable' }).waitFor();
  assert.equal(await oneoff.getByLabel('Video URL', { exact: true }).inputValue(), 'https://www.youtube.com/watch?v=ccccccccccc');
  await page.unroute('**/api/downloads/videos');
  await page.getByRole('alert').getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[role="alert"]'));
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/downloads-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/downloads-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile page overflows horizontally');
  await page.getByRole('link', { name: 'LIKED', exact: true }).last().click();
  await page.waitForURL('**/liked');
  await page.getByText('Test video', { exact: true }).first().waitFor();
  assert.deepEqual(failures, []);
  console.log('PASS: browser source/history/quality, download + ingestion, schedule persistence, one-off, cookie privacy, shared channel/liked files, partial result, cancellation, import, logs, error recovery, mobile layout/navigation');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await new Promise(done => { if (server.exitCode !== null) return done(); server.once('exit', done); setTimeout(() => { server.kill('SIGKILL'); done(); }, 10000).unref(); });
}
