// Makes the DivJS videos from real gameplay: a vertical Short (1080x1920)
// and a 16:9 trailer (1920x1080), each at full quality and as a small
// -share file, with or without narration.
//
//   npm run trailer -- short                 the Short, no narration
//   npm run trailer -- trailer --vo          the trailer, narrated
//   npm run trailer -- all --both            everything, with and without
//   options:
//     --out <dir>          where videos and recordings go (default dist/trailer)
//     --fresh              record every take again (they are kept otherwise)
//     --vo / --both        narrate (needs --vo-python or $DIVJS_VO_PYTHON:
//                          a Python with kokoro, soundfile, faster-whisper)
//     --voice bm_george    Kokoro voice      --speed 1.0   speaking speed
//     --check              also writes contact sheets and runs the checks
//                          of check.mjs on the results
//
// How it works:
// - Every take (a game played by its script from tools/game-shots.mjs,
//   the playground editor, the Blocks editor, each text screen, the
//   music) runs in Chromium on a virtual clock (vclock.js): each engine
//   frame is one video frame at exactly 60 fps, and the page's sound is
//   rendered offline in sync with it.
// - Text screens and the music are DIV programs (cards.mjs, music.mjs)
//   run by DivJS itself; pixel art is only ever scaled nearest-neighbour.
// - timeline.mjs says what is cut where; vo_lines.json what is said.
//   With narration, segments grow to fit their line (in whole beats) and
//   music and game sound duck 8 dB under the voice (mix.mjs).
//
// Re-timing: edit timeline.mjs (beats, from, texts, order) and run again;
// only the takes that changed are recorded again.

import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { ROOT, startServer, option } from '../game-shots.mjs';
import { TAKES, VIDEOS } from './timeline.mjs';
import { recordTakes } from './capture.mjs';
import { plan, planTakes, render } from './render.mjs';
import { check } from './check.mjs';

const args = process.argv.slice(2);
const which = args.find((a, i) => !a.startsWith('--') && !(args[i - 1] || '').match(/^--(out|voice|speed|vo-python)$/)) || 'all';
const names = which === 'all' ? Object.keys(VIDEOS) : which.split(',');
for (const name of names)
{
  if (!VIDEOS[name])
  {
    console.error(`No video "${name}": ${Object.keys(VIDEOS).join(', ')} or all`);
    process.exit(1);
  }
}
const outDir = resolve(ROOT, option('out', 'dist/trailer'));
const takesDir = join(outDir, 'takes');
const variants = args.includes('--both') ? [false, true] : [args.includes('--vo')];
const voice = option('voice', 'bm_george');
const speed = option('speed', '1.0');
const python = option('vo-python', process.env.DIVJS_VO_PYTHON);

function runPython(videoName, dir)
{
  if (!python)
  {
    throw new Error('Narration needs a Python with kokoro: pass --vo-python <path> or set DIVJS_VO_PYTHON');
  }
  const script = fileURLToPath(new URL('./vo.py', import.meta.url));
  return new Promise((resolve, reject) =>
  {
    const child = spawn(python, [script, '--video', videoName, '--out', dir, '--voice', voice, '--speed', speed], { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`vo.py exited with ${code}`))));
  });
}

// --fresh records each take once in this run, not once per video.
const recorded = new Set();
const fresh = args.includes('--fresh') ? (take) => !recorded.has(take) : false;

const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
try
{
  await mkdir(takesDir, { recursive: true });
  for (const name of names)
  {
    for (const narrated of variants)
    {
      const label = narrated ? `${name}-vo` : name;
      console.log(`${label}:`);
      let vo = null;
      let voDir = null;
      if (narrated)
      {
        voDir = join(outDir, 'vo', name);
        await runPython(name, voDir);
        vo = JSON.parse(await readFile(join(voDir, 'vo.json'), 'utf8'));
        for (const [id, line] of Object.entries(vo.lines))
        {
          if (line.match < 0.8)
          {
            console.warn(`  warning: narration "${id}" was heard as "${line.heard}" (match ${line.match})`);
          }
        }
      }
      const p = plan(name, { vo, voDir });
      p.name = label;
      const used = Object.fromEntries(p.segments.filter((s) => s.take).map((s) => [s.take, TAKES[s.take]]));
      // The footage first: the text screens are laid out around it.
      const metas = await recordTakes(browser, base, used, takesDir, { fresh });
      const made = planTakes(p, metas);
      await recordTakes(browser, base, made, takesDir, { fresh });
      [...Object.keys(used), ...Object.keys(made)].forEach((take) => recorded.add(take));
      const files = await render(p, { takesDir, outDir });
      if (args.includes('--check'))
      {
        await check(files, outDir);
      }
    }
  }
}
finally
{
  await browser.close();
  server.close();
}
