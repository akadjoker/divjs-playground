// Checks a finished tutorial video: streams, length and size, black and
// frozen stretches, loudness and true peak, a contact sheet (a frame every
// 3 s, left to right, from 1.5 s) and full-size frames at chosen times, to look at.
//
//   node tools/tutorial/check.mjs <video.mp4> [--frames 5,31.5]

import { stat, mkdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ffmpeg } from '../trailer/media.mjs';

export async function checkVideo(file, { sheetEvery = 3, frames = [], outDir = dirname(file) } = {})
{
  await mkdir(outDir, { recursive: true });
  const info = await ffmpeg(['-i', file, '-f', 'null', '-t', '0', '-']).catch((e) => e.message);
  const video = /Stream #0:\d.*Video: (\w+) \(([^)]*)\).*?, (\w+)[(,].*?(\d{3,5})x(\d{3,5}).*?([\d.]+) fps/.exec(info);
  const audio = /Stream #0:\d.*Audio: (\w+).*?(\d+) Hz, (\w+)/.exec(info);
  const duration = /Duration: (\d+):(\d+):([\d.]+)/.exec(info);
  const scan = await ffmpeg(['-nostats', '-i', file,
    '-filter_complex', '[0:v]blackdetect=d=0.2:pix_th=0.05,freezedetect=n=0.001:d=2[v];[0:a]ebur128=peak=true:framelog=quiet[a]',
    '-map', '[v]', '-map', '[a]', '-f', 'null', '-']);
  const black = [...scan.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const frozen = [];
  for (const m of scan.matchAll(/freeze_start: ([\d.]+)|freeze_end: ([\d.]+)/g))
  {
    if (m[1])
    {
      frozen.push([Number(m[1]), null]);
    }
    else if (frozen.length > 0)
    {
      frozen[frozen.length - 1][1] = Number(m[2]);
    }
  }
  const summary = scan.slice(scan.lastIndexOf('Summary'));
  const lufs = /I:\s+(-?[\d.]+) LUFS/.exec(summary);
  const peak = /True peak:\s+Peak:\s+(-?[\d.]+) dBFS/.exec(summary);
  const seconds = duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : 0;
  const name = basename(file, '.mp4');
  const sheet = join(outDir, `${name}-sheet.png`);
  const cols = 5;
  const rows = Math.max(1, Math.ceil(seconds / sheetEvery / cols));
  await ffmpeg(['-i', file, '-vf', `fps=1/${sheetEvery}:start_time=${sheetEvery / 2},scale=480:-2,tile=${cols}x${rows}:padding=4:color=white`,
    '-frames:v', '1', sheet]);
  const stills = [];
  for (const t of frames)
  {
    const still = join(outDir, `${name}-at-${String(t).replace('.', '_')}s.png`);
    await ffmpeg(['-ss', String(t), '-i', file, '-frames:v', '1', still]);
    stills.push(still);
  }
  return {
    file,
    bytes: (await stat(file)).size,
    seconds,
    video: video ? { codec: video[1], profile: video[2], pix: video[3], size: `${video[4]}x${video[5]}`, fps: Number(video[6]) } : null,
    audio: audio ? { codec: audio[1], rate: Number(audio[2]), layout: audio[3] } : null,
    faststart: await moovFirst(file),
    black,
    frozen,
    lufs: lufs ? Number(lufs[1]) : null,
    truePeak: peak ? Number(peak[1]) : null,
    sheet,
    stills
  };
}

// True when the file's index (moov) comes before its media (mdat).
async function moovFirst(file)
{
  const { open } = await import('node:fs/promises');
  const handle = await open(file, 'r');
  try
  {
    const buf = Buffer.alloc(64 * 1024);
    await handle.read(buf, 0, buf.length, 0);
    const moov = buf.indexOf('moov');
    const mdat = buf.indexOf('mdat');
    return moov >= 0 && (mdat < 0 || moov < mdat);
  }
  finally
  {
    await handle.close();
  }
}

export function describe(r)
{
  return [
    `${basename(r.file)}: ${r.video?.size} ${r.video?.fps} fps ${r.video?.codec} (${r.video?.profile}) ${r.video?.pix}, ${r.audio?.codec} ${r.audio?.rate} Hz ${r.audio?.layout}, `
      + `${r.seconds.toFixed(2)} s, ${(r.bytes / 1e6).toFixed(2)} MB, faststart ${r.faststart}`,
    `  loudness ${r.lufs} LUFS, true peak ${r.truePeak} dBTP`,
    `  black: ${JSON.stringify(r.black)}  frozen >= 2 s: ${JSON.stringify(r.frozen)}`,
    `  sheet: ${r.sheet}${r.stills.length ? `\n  frames: ${r.stills.join(' ')}` : ''}`
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url))
{
  const args = process.argv.slice(2);
  const i = args.indexOf('--frames');
  const frames = i >= 0 ? args[i + 1].split(',').map(Number) : [];
  for (const file of args.filter((a, k) => !a.startsWith('--') && args[k - 1] !== '--frames'))
  {
    console.log(describe(await checkVideo(file, { frames })));
  }
}
