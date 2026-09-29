// Records a tutorial: a page in Chromium on the virtual clock of
// tools/trailer/vclock.js, one video frame at a time, with a camera that
// pans and zooms over the page, a pointer drawn over it (overlay.js) and
// the narration setting the pace.
//
// A lesson (lessons/*.mjs) is a list of steps; each step starts its line
// of narration and acts while it is spoken, through the Director `t`:
//
//   t.focus(rect)  t.wide()           move the camera (it eases there)
//   t.moveTo(point)  t.click()        move the pointer, click where it is
//   t.press()  t.release()  t.glide() the parts of a drag (blocks.mjs)
//   t.cue('name')                     wait for the {name} marker of the line
//   t.lineEnd(-0.5)                   wait for the line's end (+/- seconds)
//   t.wait(seconds)  t.tween(seconds, fn)
//   t.highlight(rect)  t.card(name)  t.hideCard()
//
// Every frame is drawn from this state, so the same lesson records the
// same video every time.

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { ffmpeg, writeFrame } from '../trailer/media.mjs';
import { VIDEO, TIMING } from './config.mjs';

const VCLOCK = fileURLToPath(new URL('../trailer/vclock.js', import.meta.url));
const OVERLAY = fileURLToPath(new URL('./overlay.js', import.meta.url));

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (k) => k * k * (3 - 2 * k);
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

// A lossless 1920x1080 video from PNG frames of any size near it.
function pngEncoder(file, fps)
{
  let stdin = null;
  const done = ffmpeg(['-f', 'image2pipe', '-c:v', 'png', '-framerate', String(fps), '-i', '-',
    '-vf', `scale=${VIDEO.width}:${VIDEO.height}:flags=lanczos,format=yuv444p`, '-c:v', 'libx264', '-qp', '0', '-preset', 'ultrafast', file],
  { input: (s) => { stdin = s; } });
  return {
    write: (bytes) => writeFrame(stdin, bytes),
    close: async () =>
    {
      stdin.end();
      await done;
    }
  };
}

export class Director
{
  // vo: the report of vo.py (lines with seconds, cues, words); script:
  // the lesson's text for this language (cards, lines).
  constructor({ page, cdp, vo, voDir, script, fps = VIDEO.fps })
  {
    this.page = page;
    this.cdp = cdp;
    this.vo = vo;
    this.voDir = voDir;
    this.script = script;
    this.fps = fps;
    this.frame = 0;
    this.encoder = null;
    this.view = VIDEO.viewport;
    this.mouse = { x: this.view.width * 0.55, y: this.view.height * 0.6 };
    this.down = false;
    this.ripples = [];
    this.ringState = null;
    this.cardState = null;
    const wide = this.wideRect();
    this.camera = { from: wide, to: wide, t0: 0, seconds: 0 };
    this.lines = [];
    this.line = null;
  }

  get time()
  {
    return this.frame / this.fps;
  }

  // ── Recording ─────────────────────────────────────────────────────────

  start(file)
  {
    this.file = file;
    this.encoder = pngEncoder(file, this.fps);
  }

  async finish(timelineFile)
  {
    await this.encoder.close();
    const timeline = { fps: this.fps, frames: this.frame, seconds: this.time, file: this.file, lines: this.lines };
    await writeFile(timelineFile, JSON.stringify(timeline, null, 2));
    return timeline;
  }

  // One video frame: the page's clock moves 1/fps s, the overlay is drawn
  // and the camera's part of the page is captured at its zoom.
  async tick()
  {
    const t = this.time;
    const cam = this.cameraAt(t);
    const zoom = this.view.width / cam.w;
    const wobble = { x: 1.2 * Math.sin(t * 1.9) + 0.6 * Math.sin(t * 3.7), y: 1.0 * Math.cos(t * 1.4) + 0.5 * Math.sin(t * 2.9) };
    const state = {
      // The pointer is ~40 px in the video wide, a little bigger up close.
      cursor: this.cursorHidden ? null : { x: this.mouse.x + wobble.x, y: this.mouse.y + wobble.y, scale: 1.25 * Math.pow(zoom, -0.55), down: this.down },
      ripples: this.rippleState(t, zoom),
      ring: this.ringAt(t),
      card: this.cardAt(t)
    };
    const steps = Math.round(60 / this.fps);
    await this.page.evaluate(async ([s, n]) =>
    {
      for (let i = 0; i < n; i++)
      {
        // A page that runs a game asks for the next frame at the end of
        // every frame: wait for it to finish this one (as capture.mjs).
        const loop = window.__vclock.waiting();
        window.__vclock.step();
        const until = Date.now() + 5000;
        while (loop && !window.__vclock.waiting() && Date.now() < until)
        {
          await new Promise((resolve) => setTimeout(resolve, 1));
        }
      }
      window.__tutorial.apply(s);
    }, [state, steps]);
    if (this.encoder)
    {
      const h = cam.w * 9 / 16;
      const shot = await this.cdp.send('Page.captureScreenshot', {
        format: 'png',
        optimizeForSpeed: true,
        clip: { x: cam.x, y: cam.y, width: cam.w, height: h, scale: VIDEO.width / cam.w }
      });
      await this.encoder.write(Buffer.from(shot.data, 'base64'));
    }
    this.frame++;
  }

  async until(time)
  {
    while (this.time < time - 1e-6)
    {
      await this.tick();
    }
  }

  async wait(seconds)
  {
    await this.until(this.time + seconds);
  }

  // Calls fn(k) every frame for `seconds`, k going 0..1 (eased).
  async tween(seconds, fn, ease = easeInOut)
  {
    const n = Math.max(1, Math.round(seconds * this.fps));
    for (let i = 1; i <= n; i++)
    {
      await fn(ease(i / n));
      await this.tick();
    }
  }

  // ── Narration ─────────────────────────────────────────────────────────

  // Starts the line `id` now.
  speak(id)
  {
    const info = this.vo.lines[id];
    if (!info)
    {
      throw new Error(`no narration for "${id}"`);
    }
    this.line = { id, start: this.time, seconds: info.seconds, cues: info.cues, file: join(this.voDir, `${id}.wav`) };
    this.lines.push({ id, start: this.line.start, seconds: info.seconds, file: this.line.file });
    return this.line;
  }

  // Time of the {name} marker of the current line.
  cueTime(name)
  {
    const at = this.line && this.line.cues[name];
    if (at === undefined)
    {
      throw new Error(`the line "${this.line && this.line.id}" has no {${name}} marker`);
    }
    return this.line.start + at;
  }

  async cue(name, offset = 0)
  {
    await this.until(this.cueTime(name) + offset);
  }

  lineEndTime(offset = 0)
  {
    return this.line.start + this.line.seconds + offset;
  }

  async lineEnd(offset = 0)
  {
    await this.until(this.lineEndTime(offset));
  }

  // ── Camera ────────────────────────────────────────────────────────────

  wideRect()
  {
    return { x: 0, y: 0, w: this.view.width };
  }

  // Where the camera is at time t, with a slow "breathing" zoom of about
  // 1% so a still page never makes a frozen picture.
  cameraAt(t)
  {
    const c = this.camera;
    const k = c.seconds > 0 ? easeInOut(clamp((t - c.t0) / c.seconds, 0, 1)) : 1;
    const fw = c.from.w;
    const tw = c.to.w;
    const w = fw * Math.pow(tw / fw, k);
    const fc = { x: c.from.x + fw / 2, y: c.from.y + fw * 9 / 32 };
    const tc = { x: c.to.x + tw / 2, y: c.to.y + tw * 9 / 32 };
    const cx = fc.x + (tc.x - fc.x) * k;
    const cy = fc.y + (tc.y - fc.y) * k;
    // Two slow motions of different periods: never still at the same time.
    const breath = 1 - 0.011 * (0.5 - 0.5 * Math.cos(2 * Math.PI * t / 7));
    const drift = 0.004 * w * Math.sin(2 * Math.PI * t / 11.3);
    return this.clampRect({ x: cx + drift - (w * breath) / 2, y: cy - (w * breath * 9 / 16) / 2, w: w * breath });
  }

  clampRect(r)
  {
    const w = clamp(r.w, this.view.width / VIDEO.maxZoom, this.view.width);
    const h = w * 9 / 16;
    return { x: clamp(r.x, 0, this.view.width - w), y: clamp(r.y, 0, this.view.height - h), w };
  }

  // The camera rect that shows `rect` (page pixels) whole, above the
  // subtitles, with `pad` around it and no closer than `zoom`.
  frameFor(rect, { pad = 28, zoom = VIDEO.maxZoom } = {})
  {
    const band = VIDEO.subtitleBand;
    const needW = rect.w + 2 * pad;
    const needH = (rect.h + 2 * pad) / (1 - band);
    const w = clamp(Math.max(needW, needH * 16 / 9, this.view.width / zoom), this.view.width / VIDEO.maxZoom, this.view.width);
    const h = w * 9 / 16;
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    return this.clampRect({ x: cx - w / 2, y: cy - h * (1 - band) / 2, w });
  }

  // Eases the camera to show `rect` (or several rects) over `seconds`.
  focus(rects, { seconds = 1.1, ...options } = {})
  {
    const list = Array.isArray(rects) ? rects : [rects];
    const x0 = Math.min(...list.map((r) => r.x));
    const y0 = Math.min(...list.map((r) => r.y));
    const x1 = Math.max(...list.map((r) => r.x + r.w));
    const y1 = Math.max(...list.map((r) => r.y + r.h));
    this.moveCamera(this.frameFor({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, options), seconds);
  }

  wide(seconds = 1.1)
  {
    this.moveCamera(this.wideRect(), seconds);
  }

  moveCamera(to, seconds)
  {
    const c = this.camera;
    const k = c.seconds > 0 ? easeInOut(clamp((this.time - c.t0) / c.seconds, 0, 1)) : 1;
    // From wherever it is now (without the breathing).
    const fw = c.from.w;
    const w = fw * Math.pow(c.to.w / fw, k);
    const cx = c.from.x + fw / 2 + (c.to.x + c.to.w / 2 - c.from.x - fw / 2) * k;
    const cy = c.from.y + fw * 9 / 32 + (c.to.y + c.to.w * 9 / 32 - c.from.y - fw * 9 / 32) * k;
    this.camera = { from: { x: cx - w / 2, y: cy - w * 9 / 32, w }, to, t0: this.time, seconds };
  }

  // ── Pointer ───────────────────────────────────────────────────────────

  // Moves the pointer to `to` ({x, y}, page pixels) along a slight curve,
  // in `seconds` (by default from the distance). Or, with `aim` (a drag),
  // it homes in on a moving target: aim() says how far off it still is.
  async moveTo(to, { seconds, aim = null } = {})
  {
    const from = { ...this.mouse };
    const dist = to ? Math.hypot(to.x - from.x, to.y - from.y) : 0;
    const time = seconds ?? clamp(0.3 + dist / 1500, 0.35, 1.0);
    const n = Math.max(1, Math.round(time * this.fps));
    const bend = clamp(dist * 0.08, 0, 40);
    const nx = dist > 0 ? -(to.y - from.y) / dist : 0;
    const ny = dist > 0 ? (to.x - from.x) / dist : 0;
    for (let i = 1; i <= n; i++)
    {
      if (aim)
      {
        const off = await aim();
        const target = { x: this.mouse.x + off.x, y: this.mouse.y + off.y };
        // Home in on the target: the remaining share of the way, eased.
        const k0 = easeInOut((i - 1) / n);
        const k1 = easeInOut(i / n);
        const f = k0 >= 1 ? 1 : (k1 - k0) / (1 - k0);
        this.mouse = { x: this.mouse.x + (target.x - this.mouse.x) * f, y: this.mouse.y + (target.y - this.mouse.y) * f };
      }
      else
      {
        const k = easeInOut(i / n);
        const arc = Math.sin(Math.PI * k) * bend;
        this.mouse = { x: from.x + (to.x - from.x) * k + nx * arc, y: from.y + (to.y - from.y) * k + ny * arc };
      }
      await this.page.mouse.move(this.mouse.x, this.mouse.y);
      await this.tick();
    }
  }

  async press()
  {
    await this.page.mouse.move(this.mouse.x, this.mouse.y);
    await this.page.mouse.down();
    this.down = true;
    this.ripples.push({ x: this.mouse.x, y: this.mouse.y, t0: this.time });
    await this.tick();
  }

  async release()
  {
    await this.page.mouse.up();
    this.down = false;
    await this.tick();
  }

  async click({ hold = 0.1 } = {})
  {
    await this.press();
    await this.wait(hold);
    await this.release();
  }

  // Click ripples: a ring that grows and fades in 0.5 s (~36 px wide in
  // the video whatever the zoom).
  rippleState(t, zoom)
  {
    this.ripples = this.ripples.filter((r) => t - r.t0 < 0.5);
    return this.ripples.map((r) =>
    {
      const k = clamp((t - r.t0) / 0.5, 0, 1);
      return { x: r.x, y: r.y, r: (8 + 22 * smooth(k)) / Math.pow(zoom, 0.7), alpha: 1 - k };
    });
  }

  // ── Highlight ring and title cards ────────────────────────────────────

  // A ring around `rect` (page pixels), or null to fade it out.
  highlight(rect, { pad = 6 } = {})
  {
    const now = this.ringAt(this.time);
    if (rect)
    {
      this.ringState = { rect: { x: rect.x - pad, y: rect.y - pad, w: rect.w + 2 * pad, h: rect.h + 2 * pad }, from: now && this.ringState?.rect ? now.alpha : 0, to: 1, t0: this.time };
    }
    else if (this.ringState)
    {
      this.ringState = { ...this.ringState, from: now ? now.alpha : 0, to: 0, t0: this.time };
    }
  }

  ringAt(t)
  {
    const r = this.ringState;
    if (!r)
    {
      return null;
    }
    const alpha = r.from + (r.to - r.from) * smooth(clamp((t - r.t0) / 0.3, 0, 1));
    return alpha > 0.001 ? { x: r.rect.x, y: r.rect.y, w: r.rect.w, h: r.rect.h, alpha } : null;
  }

  // Shows the script's card `name` ({ kicker, title }); a banner sits over
  // the page instead of covering it.
  card(name, { banner = false, fade = 0.5 } = {})
  {
    const text = this.script.cards[name];
    this.cardState = { ...text, banner, from: 0, to: 1, t0: this.time, fade, shown: this.time };
  }

  hideCard({ fade = 0.6 } = {})
  {
    const now = this.cardAt(this.time);
    this.cardState = { ...this.cardState, from: now ? now.alpha : 0, to: 0, t0: this.time, fade };
  }

  cardAt(t)
  {
    const c = this.cardState;
    if (!c)
    {
      return null;
    }
    const alpha = c.from + (c.to - c.from) * smooth(clamp((t - c.t0) / c.fade, 0, 1));
    if (alpha <= 0.001)
    {
      return null;
    }
    return { kicker: c.kicker, title: c.title, banner: c.banner, alpha, rule: smooth(clamp((t - c.shown - 0.2) / 0.8, 0, 1)) };
  }
}

// Opens `url` for recording: the virtual clock, the overlay, the viewport.
export async function openPage(browser, url, { seed = 1, audioSeconds = 300, init = [] } = {})
{
  const context = await browser.newContext({ viewport: VIDEO.viewport, deviceScaleFactor: 1 });
  await context.addInitScript((config) =>
  {
    window.__vclockConfig = config;
  }, { seed, audioSeconds });
  await context.addInitScript({ path: VCLOCK });
  await context.addInitScript({ path: OVERLAY });
  for (const script of init)
  {
    await context.addInitScript(script);
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
  await page.goto(url);
  const cdp = await context.newCDPSession(page);
  return { context, page, cdp, problems };
}

// Records `lesson` (a lessons/*.mjs module) in the language of `script`
// to <dir>/<name>.mkv and <dir>/<name>.timeline.json.
export async function recordLesson(browser, base, lesson, { script, vo, voDir, dir, name, log = console.log })
{
  const missing = lesson.steps.filter((s) => !vo.lines[s.id]).map((s) => s.id);
  const unused = Object.keys(script.lines).filter((id) => !lesson.steps.some((s) => s.id === id));
  if (missing.length || unused.length)
  {
    throw new Error(`${name}: steps without a line: ${missing.join(', ') || '-'}; lines without a step: ${unused.join(', ') || '-'}`);
  }
  const { context, page, cdp, problems } = await openPage(browser, `${base}/${lesson.url(script.language)}`, lesson.page || {});
  try
  {
    const t = new Director({ page, cdp, vo, voDir, script });
    await lesson.ready(t);
    const video = join(dir, `${name}.mkv`);
    t.start(video);
    const started = Date.now();
    await t.wait(TIMING.head);
    for (const step of lesson.steps)
    {
      const line = t.speak(step.id);
      await step.run(t);
      await t.until(line.start + line.seconds + (step.gap ?? TIMING.gap));
      log(`  ${step.id}: ${line.start.toFixed(2)}-${t.time.toFixed(2)} s`);
    }
    await t.wait(TIMING.tail - TIMING.gap);
    const timeline = await t.finish(join(dir, `${name}.timeline.json`));
    log(`  recorded ${timeline.frames} frames (${timeline.seconds.toFixed(1)} s) in ${((Date.now() - started) / 1000).toFixed(0)} s`);
    if (problems.length)
    {
      log(`  page problems: ${problems.slice(0, 3).join(' | ')}`);
    }
    return timeline;
  }
  finally
  {
    await context.close();
  }
}
