// Records the trailer's takes: each one is a page (a game in the
// playground, the playground editor, the Blocks editor, a text card run
// by DivJS) driven on the virtual clock of vclock.js. A take is saved as
//   <out>/takes/<name>.mkv   lossless 60 fps video, one engine frame each
//   <out>/takes/<name>.wav   its own sound, same length (games only)
//   <out>/takes/<name>.json  size, frame count, what was recorded
// and is only recorded again when its definition changes (or --fresh).

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOTS, runSteps } from '../game-shots.mjs';
import { FPS, frameEncoder, writeWav, floatsFromBase64 } from './media.mjs';

const VCLOCK = fileURLToPath(new URL('./vclock.js', import.meta.url));
const FRAME_MS = 1000 / FPS;

// A clock for runSteps() that moves the page's virtual time. Every frame
// it advances is passed to `onFrame` (which records it or not).
function virtualClock(page, onFrame)
{
  let owed = 0;
  const frame = async () =>
  {
    await page.evaluate(async () =>
    {
      // A page that runs a game asks for the next frame at the end of every
      // frame; when it did last time, wait for it to finish this one too
      // (a frame that loads files waits for them).
      const loop = window.__vclock.waiting();
      window.__vclock.step();
      const until = Date.now() + 5000;
      while (loop && !window.__vclock.waiting() && Date.now() < until)
      {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
    });
    await onFrame();
    owed -= FRAME_MS;
  };
  const clock = {
    frame,
    async wait(ms)
    {
      owed += ms;
      while (owed >= FRAME_MS / 2)
      {
        await frame();
      }
    },
    // A key press lasts one frame, so key() sees it as well as key_pressed().
    async press(key)
    {
      await page.keyboard.down(key);
      await frame();
      await page.keyboard.up(key);
    },
    async move(x0, y0, x1, y1, steps)
    {
      for (let i = 1; i <= steps; i++)
      {
        await page.mouse.move(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps);
        await frame();
      }
    }
  };
  return clock;
}

// Grabs `selector` (a canvas) as raw RGBA, or the page as PNG when
// `screenshot` is set.
async function grab(page, take)
{
  if (take.screenshot)
  {
    return { png: await page.screenshot({ type: 'png', clip: take.screenshot.clip, animations: 'allow', caret: 'initial' }) };
  }
  const shot = await page.evaluate((selector) =>
  {
    const canvas = document.querySelector(selector);
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let binary = '';
    for (let i = 0; i < data.length; i += 0x8000)
    {
      binary += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000));
    }
    return { w: canvas.width, h: canvas.height, b64: btoa(binary) };
  }, take.canvas || '#game');
  return { w: shot.w, h: shot.h, rgba: Buffer.from(shot.b64, 'base64') };
}

async function openPage(browser, base, take)
{
  const context = await browser.newContext({
    viewport: take.viewport || { width: 1400, height: 900 },
    deviceScaleFactor: take.scale || 1
  });
  await context.addInitScript((config) =>
  {
    window.__vclockConfig = config;
  }, { seed: take.seed ?? 1, audioSeconds: take.audioSeconds || 120 });
  await context.addInitScript({ path: VCLOCK });
  if (take.pointer)
  {
    await context.addInitScript(take.pointer);
  }
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) =>
  {
    if (m.type() === 'error')
    {
      problems.push(m.text());
    }
  });
  await page.goto(`${base}/${take.url}`);
  return { context, page, problems };
}

// Records one take (see TAKES in timeline.mjs for the fields).
export async function recordTake(browser, base, name, take, outDir)
{
  const { context, page, problems } = await openPage(browser, base, take);
  try
  {
    let encoder = null;
    let frames = 0;
    let size = null;
    let recording = false;
    const onFrame = async () =>
    {
      if (!recording)
      {
        return;
      }
      const shot = await grab(page, take);
      if (!encoder)
      {
        size = shot.png ? take.screenshot.size : { width: shot.w, height: shot.h };
        encoder = frameEncoder(join(outDir, `${name}.mkv`), { ...size, png: !!shot.png });
      }
      else if (!shot.png && (shot.w !== size.width || shot.h !== size.height))
      {
        throw new Error(`${name}: the canvas changed size while recording (${shot.w}x${shot.h})`);
      }
      await encoder.write(shot.png || shot.rgba);
      frames++;
    };
    const clock = virtualClock(page, onFrame);
    const ctx = { page, clock, take, run: (steps) => runSteps(page, steps, clock) };
    await take.ready(ctx);
    const shot = take.shot ? SHOTS[take.shot] : null;
    await ctx.run(take.setup || (shot ? shot.setup : []));
    recording = true;
    const recordFrom = await page.evaluate(() => window.__vclock.now());
    const total = Math.round(take.seconds * FPS);
    let regions = null;
    if (take.play)
    {
      regions = await take.play(ctx);
    }
    else
    {
      await ctx.run(take.steps || (shot ? shot.play : []));
    }
    while (frames < total)
    {
      await clock.frame();
    }
    recording = false;
    await encoder.close();
    let audio = false;
    if (take.audio !== false)
    {
      const sound = await page.evaluate(([a, b]) => window.__vclock.renderAudio(a, b), [recordFrom, recordFrom + frames * FRAME_MS]);
      if (sound)
      {
        await writeWav(join(outDir, `${name}.wav`), floatsFromBase64(sound.left), floatsFromBase64(sound.right), sound.rate);
        audio = true;
      }
    }
    const meta = { name, frames, seconds: frames / FPS, ...size, audio, regions, problems, key: takeKey(take) };
    await writeFile(join(outDir, `${name}.json`), JSON.stringify(meta, null, 2));
    return meta;
  }
  finally
  {
    await context.close();
  }
}

// What a take's recording depends on: when it changes, the take is
// recorded again.
export function takeKey(take)
{
  const shot = take.shot ? SHOTS[take.shot] : null;
  return JSON.stringify({ take, shot }, (k, v) => (typeof v === 'function' ? v.toString() : v));
}

// Records the takes that are missing or out of date; returns their metas.
export async function recordTakes(browser, base, takes, outDir, { fresh = false, log = console.log } = {})
{
  await mkdir(outDir, { recursive: true });
  const metas = {};
  for (const [name, take] of Object.entries(takes))
  {
    const metaFile = join(outDir, `${name}.json`);
    if (!(typeof fresh === 'function' ? fresh(name) : fresh))
    {
      try
      {
        const meta = JSON.parse(await readFile(metaFile, 'utf8'));
        await stat(join(outDir, `${name}.mkv`));
        if (meta.key === takeKey(take))
        {
          metas[name] = meta;
          continue;
        }
      }
      catch
      {
        // not recorded yet
      }
    }
    const started = Date.now();
    const meta = await recordTake(browser, base, name, take, outDir);
    log(`take ${name}: ${meta.frames} frames ${meta.width}x${meta.height}${meta.audio ? ' + sound' : ''} in ${((Date.now() - started) / 1000).toFixed(0)} s${meta.problems.length ? ` - page problems: ${meta.problems.slice(0, 2).join(' | ')}` : ''}`);
    metas[name] = meta;
  }
  return metas;
}
