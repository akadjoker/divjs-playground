// Puts a video together from its takes: plans the segments (timeline.mjs,
// re-timed to the narration when there is one), lays each one out (a text
// screen from cards.mjs scaled up nearest-neighbour, game footage cropped
// and scaled by a whole number, editor footage), renders the segments with
// ffmpeg, joins them and adds the mix from mix.mjs. Writes
//   <out>/<name>.mp4        full quality, H.264 + AAC, +faststart
//   <out>/<name>-share.mp4  under ~15 MB (720p, 30 fps, capped bit rate)

import { mkdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { VIDEOS, FORMATS, TAKES } from './timeline.mjs';
import { cardSource, COLORS } from './cards.mjs';
import { soundtrackSource, MUSIC_DELAY } from './music.mjs';
import { FPS, ffmpeg } from './media.mjs';
import { mixAudio } from './mix.mjs';

// Narration starts this long into its segment and leaves this much after.
const VO_LEAD = 0.2;
const VO_TAIL = 0.4;
const SHARE_BYTES = 14.2e6;

// The segments with their start and length (seconds). `vo`: the report of
// vo.py ({ lines: { id: { seconds } } }) and the folder of its WAVs.
export function plan(name, { vo = null, voDir = null, log = console.log } = {})
{
  const video = VIDEOS[name];
  const format = FORMATS[video.format];
  let start = 0;
  const segments = video.segments.map((seg) =>
  {
    let seconds = seg.beats / 2;
    let line = null;
    if (vo && vo.lines[seg.id])
    {
      line = { file: join(voDir, `${seg.id}.wav`), seconds: vo.lines[seg.id].seconds, lead: VO_LEAD };
      // Longer segments for longer lines, in whole beats (0.5 s) so the
      // cuts stay on the music.
      seconds = Math.max(seconds, Math.ceil((VO_LEAD + line.seconds + VO_TAIL) * 2) / 2);
    }
    let from = seg.cuts ? seg.cuts[0][0] : seg.from || 0;
    if (seg.take && !seg.cuts)
    {
      const room = TAKES[seg.take].seconds;
      if (from + seconds > room)
      {
        from = Math.max(0, room - seconds);
        log(`  ${name}/${seg.id}: the take is too short, starting it at ${from.toFixed(2)} s`);
      }
    }
    const out = { ...seg, from, start, seconds, vo: line };
    out.pieces = pieces(out);
    start += seconds;
    return out;
  });
  return { name, format, segments, total: start };
}

// The parts of its take a segment plays, one after the other, as
// [from, seconds]: `from` to the end of the segment, or its `cuts`
// ([[from, to], ...] in take seconds, the last one running on as long as
// needed) to leave out the dull bits of a take.
function pieces(seg)
{
  if (!seg.cuts)
  {
    return [[seg.from, seg.seconds]];
  }
  const out = [];
  let left = seg.seconds;
  seg.cuts.forEach(([a, b], i) =>
  {
    const last = i === seg.cuts.length - 1;
    const n = last || b === undefined ? left : Math.min(left, b - a);
    if (n > 0)
    {
      out.push([a, n]);
      left -= n;
    }
  });
  return out;
}

// ── Layout ──────────────────────────────────────────────────────────────

// Splits a name into lines of at most `max` characters.
function wrap(text, max)
{
  const lines = [];
  for (const word of text.split(' '))
  {
    const last = lines.length - 1;
    if (last >= 0 && (lines[last] + ' ' + word).length <= max)
    {
      lines[last] += ' ' + word;
    }
    else
    {
      lines.push(word);
    }
  }
  return lines.join('\n');
}

const textHeight = (text, scale, gap = 3) =>
{
  const n = text.split('\n').length;
  return (n * 8 + (n - 1) * gap) * scale;
};

// The DivJS text screen behind a segment (null: none, the footage fills it).
function screenFor(seg, plan)
{
  const [W, H] = plan.format.card;
  const base = { size: [W, H], seconds: seg.seconds };
  if (seg.texts)
  {
    return { ...base, texts: seg.texts };
  }
  const texts = [];
  if (plan.format === FORMATS.short)
  {
    // Caption above the footage, name below, each in the middle of the
    // space left there (in program pixels). Typed fast: readable at once.
    const s = plan.format.scale;
    const rects = seg.layers.map((l) => l.rect);
    const top = rects.length ? Math.min(...rects.map((r) => r[1])) / s - 1 : 80;
    const bottomEdge = rects.length ? Math.max(...rects.map((r) => r[1] + r[3])) / s + 1 : 240;
    if (seg.say)
    {
      texts.push({ text: seg.say, scale: 2, y: Math.round((top - textHeight(seg.say, 2)) / 2), cps: seg.cps || 120, at: 0.02 });
    }
    const bottom = seg.bottom || wrap(seg.name || '', 14);
    if (bottom)
    {
      texts.push({ text: bottom, scale: 2, y: Math.round(bottomEdge + (H - bottomEdge - textHeight(bottom, 2)) / 2), cps: 0, color: COLORS.accent });
    }
    return { ...base, texts };
  }
  if (seg.ui)
  {
    return null;
  }
  if (seg.stack)
  {
    // Trailer: editor parts on the starry background, no panel.
    return { ...base, texts: seg.texts || [] };
  }
  // Trailer: a panel left of the footage with the name and the caption.
  const x = 12;
  let y = 24;
  if (seg.name)
  {
    const name = wrap(seg.name, 9);
    texts.push({ text: name, scale: 2, x, y, align: 'left', cps: 0, color: COLORS.accent });
    y += textHeight(name, 2) + 16;
  }
  if (seg.say)
  {
    texts.push({ text: seg.say, scale: 1, x, y, align: 'left', cps: 120, at: 0.1, gap: 5 });
  }
  return { ...base, texts };
}

// Footage layers: { take, crop: [x, y, w, h] (take pixels), rect: [x, y,
// w, h] (video pixels), pixelArt, border }.
function layersFor(seg, plan, meta)
{
  if (!seg.take)
  {
    return [];
  }
  const [wx, wy, ww, wh] = seg.window || plan.format.window;
  if (TAKES[seg.take].screenshot)
  {
    if (!seg.stack)
    {
      return [{ take: seg.take, crop: seg.crop || [0, 0, meta.width, meta.height], rect: [0, 0, ...plan.format.size], pixelArt: false }];
    }
    // Parts of the page (`stack`) one above the other, as wide as the
    // window or `outWidth`. A part is a recorded region, or `box`: [x, y,
    // w, h] from the region's top left corner (to zoom into a line of it).
    const parts = seg.stack.map((part) =>
    {
      const [rx, ry, rw, rh] = meta.regions[part.region];
      let crop;
      if (part.box)
      {
        const [bx, by, bw, bh] = part.box;
        crop = [rx + bx, ry + by, bw, bh];
      }
      else
      {
        const x = rx + (part.left || 0);
        const w = Math.min(rw - (part.left || 0), part.width || rw);
        const h = part.height ? Math.min(rh, part.height) : rh;
        const y = part.height ? Math.round(ry + (part.at ?? 0.5) * (rh - h)) : ry;
        crop = [x, y, w, h];
      }
      const width = part.outWidth || ww;
      return { crop, width, height: Math.round(crop[3] * width / crop[2] / 2) * 2 };
    });
    const gap = 12;
    const total = parts.reduce((n, p) => n + p.height, 0) + gap * (parts.length - 1);
    let y = wy + Math.round((wh - total) / 2);
    return parts.map((p) =>
    {
      const layer = { take: seg.take, crop: p.crop, rect: [wx + Math.round((ww - p.width) / 4) * 2, y, p.width, p.height], pixelArt: false, border: true };
      y += p.height + gap;
      return layer;
    });
  }
  const zoom = seg.zoom || plan.format.zoom;
  const cw = Math.min(meta.width, Math.floor(ww / zoom));
  const ch = Math.min(meta.height, Math.floor(wh / zoom));
  const [fx, fy] = seg.focus || [meta.width / 2, meta.height / 2];
  const cx = Math.max(0, Math.min(meta.width - cw, Math.round(fx - cw / 2)));
  const cy = Math.max(0, Math.min(meta.height - ch, Math.round(fy - ch / 2)));
  const w = cw * zoom;
  const h = ch * zoom;
  const rect = [wx + Math.round((ww - w) / 4) * 2, wy + Math.round((wh - h) / 4) * 2, w, h];
  return [{ take: seg.take, crop: [cx, cy, cw, ch], rect, pixelArt: true, border: true }];
}

// ── Takes for one plan ──────────────────────────────────────────────────

const stageTake = (source, size, seconds, audio) => ({
  url: 'tools/trailer/stage.html',
  seconds,
  audio,
  audioSeconds: seconds + 5,
  source,
  ready: async ({ page, take }) =>
  {
    const errors = await page.evaluate(([s, w, h, c]) => window.startStage(s, w, h, c), [take.source, size[0], size[1], COLORS.bg]);
    if (errors.length > 0)
    {
      throw new Error(`the DIV program did not start: ${errors.join('; ')}`);
    }
  }
});

// Lays the segments out over their recorded takes (`metas`: take name ->
// its .json) and returns the card and music takes this plan needs (their
// names are unique per content).
export function planTakes(plan, metas)
{
  const takes = {};
  for (const seg of plan.segments)
  {
    seg.takeMeta = seg.take ? metas[seg.take] : null;
    seg.layers = layersFor(seg, plan, seg.takeMeta);
    const screen = screenFor(seg, plan);
    seg.screen = screen;
    if (screen)
    {
      seg.card = `card-${plan.name}-${seg.id}-${Math.round(seg.seconds * 100)}`;
      takes[seg.card] = stageTake(cardSource(screen), screen.size, seg.seconds, false);
    }
  }
  plan.music = `music-${plan.name}-${Math.round(plan.total * 100)}`;
  takes[plan.music] = stageTake(soundtrackSource(plan.segments, plan.total), [32, 32], plan.total + 1, true);
  return takes;
}

// ── Rendering ───────────────────────────────────────────────────────────

const hex = (color) => `0x${color.replace('#', '')}`;

async function renderSegment(seg, plan, takesDir, file)
{
  const [W, H] = plan.format.size;
  const args = [];
  const filters = [];
  if (seg.card)
  {
    args.push('-t', String(seg.seconds), '-i', join(takesDir, `${seg.card}.mkv`));
    const s = plan.format.scale;
    filters.push(`[0:v]scale=iw*${s}:ih*${s}:flags=neighbor,setsar=1[v0]`);
  }
  else
  {
    args.push('-f', 'lavfi', '-i', `color=c=${hex(COLORS.bg)}:s=${W}x${H}:r=${FPS}:d=${seg.seconds}`);
    filters.push('[0:v]setsar=1[v0]');
  }
  let last = 'v0';
  seg.layers.forEach((layer, i) =>
  {
    const n = i + 1;
    let pick = '';
    if (seg.pieces.length > 1)
    {
      // The pieces of the take back to back (frame-exact, from its start).
      const spans = seg.pieces.map(([a, n]) => `gte(t\\,${(a - 0.001).toFixed(4)})*lt(t\\,${(a + n - 0.001).toFixed(4)})`);
      pick = `select=${spans.join('+')},setpts=N/(${FPS}*TB),`;
      args.push('-i', join(takesDir, `${layer.take}.mkv`));
    }
    else
    {
      args.push('-ss', seg.from.toFixed(4), '-t', String(seg.seconds), '-i', join(takesDir, `${layer.take}.mkv`));
    }
    const [cx, cy, cw, ch] = layer.crop;
    const [x, y, w, h] = layer.rect;
    const scaler = layer.pixelArt ? 'neighbor' : 'lanczos';
    const thicken = seg.thicken ? 'dilation,' : '';
    filters.push(`[${n}:v]${pick}crop=${cw}:${ch}:${cx}:${cy},${thicken}scale=${w}:${h}:flags=${scaler},setsar=1[l${n}]`);
    let out = `o${n}`;
    filters.push(`[${last}][l${n}]overlay=${x}:${y}:eof_action=repeat[${out}]`);
    if (layer.border)
    {
      const t = 6;
      filters.push(`[${out}]drawbox=x=${x - t}:y=${y - t}:w=${w + 2 * t}:h=${h + 2 * t}:color=${hex(COLORS.accent)}:t=${t}[b${n}]`);
      out = `b${n}`;
    }
    last = out;
  });
  // Padded with its last frame, then cut to the exact frame count.
  filters.push(`[${last}]fps=${FPS},tpad=stop_mode=clone:stop=${FPS},format=yuv444p[out]`);
  await ffmpeg([...args, '-filter_complex', filters.join(';'), '-map', '[out]', '-frames:v', String(Math.round(seg.seconds * FPS)),
    '-c:v', 'libx264', '-qp', '0', '-preset', 'ultrafast', '-r', String(FPS), file]);
}

export async function render(plan, { takesDir, outDir, log = console.log })
{
  const work = join(outDir, 'work', plan.name);
  await mkdir(work, { recursive: true });
  const list = [];
  for (const [i, seg] of plan.segments.entries())
  {
    const file = join(work, `seg-${String(i).padStart(2, '0')}-${seg.id}.mkv`);
    await renderSegment(seg, plan, takesDir, file);
    list.push(`file '${file}'`);
    log(`  segment ${seg.id}: ${seg.start.toFixed(1)}-${(seg.start + seg.seconds).toFixed(1)} s`);
  }
  await writeFile(join(work, 'list.txt'), list.join('\n') + '\n');
  const joined = join(work, 'video.mkv');
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', join(work, 'list.txt'), '-c', 'copy', joined]);

  const audio = await mixAudio(plan, { takesDir, workDir: work, musicTake: plan.music, musicDelay: MUSIC_DELAY, log });

  const full = join(outDir, `${plan.name}.mp4`);
  const common = ['-c:a', 'aac', '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-map', '0:v', '-map', '1:a', '-shortest'];
  await ffmpeg(['-i', joined, '-i', audio, '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-r', String(FPS), '-g', String(FPS * 2),
    '-b:a', '192k', ...common, full]);

  // Share: 720p 30 fps, CRF 20 with the bit rate capped to fit the size.
  const [W, H] = plan.format.size;
  const shareSize = W > H ? '1280:720' : '720:1280';
  const audioKbps = 160;
  const videoKbps = Math.floor(SHARE_BYTES * 8 / plan.total / 1000 - audioKbps - 40);
  const share = join(outDir, `${plan.name}-share.mp4`);
  await ffmpeg(['-i', joined, '-i', audio, '-vf', `scale=${shareSize}:flags=lanczos,fps=30`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '20',
    '-maxrate', `${videoKbps}k`, '-bufsize', `${videoKbps}k`, '-g', '60', '-b:a', `${audioKbps}k`, ...common, share]);
  const sizes = await Promise.all([full, share].map(async (f) => (await stat(f)).size));
  log(`  ${full} (${(sizes[0] / 1e6).toFixed(1)} MB)\n  ${share} (${(sizes[1] / 1e6).toFixed(1)} MB)`);
  return { full, share };
}
