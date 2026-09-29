// Checks rendered videos: streams, black and frozen stretches, loudness,
// and a contact sheet (a frame every 2.5 s) to look at.
//
//   node tools/trailer/check.mjs <video.mp4>...

import { stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ffmpeg } from './media.mjs';

export async function checkVideo(file, sheetDir = dirname(file))
{
  const info = await ffmpeg(['-i', file, '-f', 'null', '-t', '0', '-']).catch((e) => e.message);
  const video = /Stream #0:\d.*Video: (\w+).*?, (\w+)[(,].*?(\d{3,5})x(\d{3,5}).*?([\d.]+) fps/.exec(info);
  const audio = /Stream #0:\d.*Audio: (\w+).*?(\d+) Hz/.exec(info);
  const duration = /Duration: (\d+):(\d+):([\d.]+)/.exec(info);
  const scan = await ffmpeg(['-nostats', '-i', file,
    '-filter_complex', '[0:v]blackdetect=d=0.2:pix_th=0.05,freezedetect=n=0.001:d=1[v];[0:a]ebur128=peak=true:framelog=quiet[a]',
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
  const peak = /Peak:\s+(-?[\d.]+) dBFS/.exec(summary);
  const seconds = duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : 0;
  const sheet = join(sheetDir, `${basename(file, '.mp4')}-sheet.png`);
  const tall = video && Number(video[4]) > Number(video[3]);
  await ffmpeg(['-i', file, '-vf', `fps=1/2.5,scale=${tall ? 270 : 480}:-2:flags=neighbor,tile=${tall ? '8x2' : '6x6'}:padding=4:color=white`, '-frames:v', '1', sheet]);
  return {
    file,
    bytes: (await stat(file)).size,
    seconds,
    video: video ? { codec: video[1], pix: video[2], size: `${video[3]}x${video[4]}`, fps: Number(video[5]) } : null,
    audio: audio ? { codec: audio[1], rate: Number(audio[2]) } : null,
    black,
    frozen,
    lufs: lufs ? Number(lufs[1]) : null,
    truePeak: peak ? Number(peak[1]) : null,
    sheet
  };
}

export async function check(files, outDir)
{
  for (const file of Object.values(files))
  {
    const r = await checkVideo(file, outDir);
    console.log(`  ${basename(file)}: ${r.video?.size} ${r.video?.fps} fps ${r.video?.codec}/${r.video?.pix}, ${r.audio?.codec} ${r.audio?.rate} Hz, ` +
      `${r.seconds.toFixed(2)} s, ${(r.bytes / 1e6).toFixed(2)} MB, ${r.lufs} LUFS, true peak ${r.truePeak} dBTP`);
    console.log(`    black: ${JSON.stringify(r.black)}  frozen: ${JSON.stringify(r.frozen)}  sheet: ${r.sheet}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url))
{
  await check(process.argv.slice(2), undefined);
}
