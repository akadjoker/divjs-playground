// Records short animated GIFs of the playground's games, for the README
// and the game pages: each game is opened in Chromium (Playwright), taken
// past its title screens, played for a few seconds with real key presses
// and mouse drags, and its canvas is recorded.
//
//   node tools/capture.mjs                     every game in SHOTS
//   node tools/capture.mjs fighter bomber      some of them
//   options: --out docs/media  --width 320  --fps 8
//            --check  also saves <id>-end.png, the game's last frame
//
// Needs Playwright's Chromium (npx playwright install chromium) and the
// gifenc package (a dev dependency). The play scripts are in
// tools/game-shots.mjs.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import gifenc from 'gifenc';
import { ROOT, SHOTS, startServer, runSteps, option } from './game-shots.mjs';

const { GIFEncoder, quantize, applyPalette } = gifenc;

async function record(page, seconds, fps, width)
{
  await page.evaluate((w) =>
  {
    const src = document.getElementById('game');
    const h = Math.round(src.height * w / src.width);
    const small = document.createElement('canvas');
    small.width = w;
    small.height = h;
    const ctx = small.getContext('2d', { willReadFrequently: true });
    window.__grab = () =>
    {
      ctx.drawImage(src, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      let binary = '';
      for (let i = 0; i < data.length; i += 0x8000)
      {
        binary += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000));
      }
      return { w, h, b64: btoa(binary) };
    };
  }, width);
  const frames = [];
  const step = 1000 / fps;
  const start = Date.now();
  let next = start;
  while (Date.now() - start < seconds * 1000)
  {
    const shot = await page.evaluate(() => window.__grab());
    frames.push({ ...shot, t: Date.now() });
    next += step;
    const wait = next - Date.now();
    if (wait > 0)
    {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  return frames;
}

function encode(frames)
{
  const { w, h } = frames[0];
  const pixels = frames.map((f) => new Uint8Array(Buffer.from(f.b64, 'base64')));
  // One palette for the whole clip, from a sample of its frames.
  const sampleEvery = Math.max(1, Math.floor(frames.length / 8));
  const sample = pixels.filter((_, i) => i % sampleEvery === 0);
  const joined = new Uint8Array(sample.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of sample)
  {
    joined.set(p, offset);
    offset += p.length;
  }
  const palette = quantize(joined, 256);
  const gif = GIFEncoder();
  pixels.forEach((p, i) =>
  {
    const delay = i + 1 < frames.length ? frames[i + 1].t - frames[i].t : 100;
    gif.writeFrame(applyPalette(p, palette), w, h, i === 0 ? { palette, delay } : { delay });
  });
  gif.finish();
  return gif.bytes();
}

const names = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !(all[i - 1] || '').startsWith('--'));
const ids = names.length > 0 ? names : Object.keys(SHOTS);
const outDir = join(ROOT, option('out', 'docs/media'));
const width = Number(option('width', 320));
const fps = Number(option('fps', 8));

const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
await mkdir(outDir, { recursive: true });
try
{
  for (const id of ids)
  {
    const shot = SHOTS[id];
    if (!shot)
    {
      console.log(`skip ${id}: no script for it in tools/game-shots.mjs`);
      continue;
    }
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const problems = [];
    page.on('pageerror', (e) => problems.push(e.message));
    page.on('console', (m) =>
    {
      if (m.type() === 'error' || m.type() === 'warning')
      {
        problems.push(m.text());
      }
    });
    await page.goto(`${base}/playground/#p=${id}`);
    await page.waitForFunction(() => window.divPlayground?.getState()?.runtime, null, { timeout: 15000 });
    await page.click('#game');
    await runSteps(page, shot.setup);
    const recording = record(page, shot.seconds, fps, width);
    await runSteps(page, shot.play);
    const frames = await recording;
    const bytes = encode(frames);
    const file = join(outDir, `${id}.gif`);
    await writeFile(file, bytes);
    if (process.argv.includes('--check'))
    {
      await (await page.$('#game')).screenshot({ path: join(outDir, `${id}-end.png`) });
    }
    console.log(`${id}: ${frames.length} frames, ${frames[0].w}x${frames[0].h}, ${(bytes.length / 1024).toFixed(0)} KB${problems.length ? `, ${problems.length} console problems: ${problems[0]}` : ''}`);
    await page.close();
  }
}
finally
{
  await browser.close();
  server.close();
}
