// Makes the narrated tutorial videos: a lesson recorded in the real
// editor, a pointer showing every click and drag, the camera moving in on
// what matters, subtitles, and a light music bed under the voice.
//
//   npm run tutorial -- blocks-1                 lesson 1 of DivJS Blocks, English
//   npm run tutorial -- blocks-1 --lang pt       ... in Portuguese
//   options:
//     --out <dir>          where the videos go (default dist/tutorial)
//     --vo-python <path>   a Python with the speech engines and faster-whisper
//                          (or $DIVJS_VO_PYTHON), see vo.py
//     --no-subtitles       no subtitles burned in (the .srt is still written)
//     --reuse              keep the last recording (to change only the sound
//                          or the encodes)
//     --check              check the videos (check.mjs) and write contact
//                          sheets; --frames 5,30 also writes those frames
//
// A lesson is two kinds of file in lessons/:
//   <lesson>.mjs          what happens on screen, step by step (the same in
//                         every language)
//   <lesson>.<lang>.json  what is said in one language: a line per step
//                         ({cue} markers where the screen acts on a word),
//                         and the title cards' text
// Each step lasts as long as its line: the narration sets the pace.

import { access, mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { ROOT, option } from '../game-shots.mjs';
import { startServer } from './server.mjs';
import { LANGUAGES } from './config.mjs';
import { recordLesson } from './director.mjs';
import { renderLesson } from './render.mjs';
import { checkVideo, describe } from './check.mjs';

const args = process.argv.slice(2);
const lessonId = args.find((a, i) => !a.startsWith('--') && !(args[i - 1] || '').match(/^--(out|lang|vo-python|frames)$/));
if (!lessonId)
{
  console.error('Which lesson? npm run tutorial -- blocks-1 [--lang en]');
  process.exit(1);
}
const lang = option('lang', 'en');
const voice = LANGUAGES[lang];
if (!voice)
{
  console.error(`No voice for "${lang}": ${Object.keys(LANGUAGES).join(', ')}`);
  process.exit(1);
}
const outDir = resolve(ROOT, option('out', 'dist/tutorial'));
const python = option('vo-python', process.env.DIVJS_VO_PYTHON);
const name = `${lessonId}-${lang}`;
const here = (file) => fileURLToPath(new URL(file, import.meta.url));

function runVo(linesFile, dir)
{
  if (!python)
  {
    throw new Error('The narration needs a Python with the speech engines: pass --vo-python <path> or set DIVJS_VO_PYTHON');
  }
  const argv = [here('./vo.py'), '--lines', linesFile, '--out', dir, '--engine', voice.engine, '--voice', voice.voice,
    '--speed', String(voice.speed), '--language', lang, '--whisper', voice.whisper, ...(voice.noise ? ['--noise', voice.noise] : [])];
  return new Promise((ok, fail) =>
  {
    const child = spawn(python, argv, { stdio: ['ignore', 'inherit', 'pipe'] });
    let log = '';
    child.stderr.on('data', (d) =>
    {
      // Only vo.py's own lines, not the libraries' warnings.
      for (const line of String(d).split('\n'))
      {
        log += `${line}\n`;
        if (/^[\w-]+: /.test(line) && !/Warning|warn/.test(line))
        {
          console.log(`  vo ${line}`);
        }
      }
    });
    child.on('error', fail);
    child.on('close', (code) => (code === 0 ? ok() : fail(new Error(`vo.py exited with ${code}:\n${log.slice(-3000)}`))));
  });
}

const lesson = (await import(here(`./lessons/${lessonId}.mjs`))).default;
const scriptFile = here(`./lessons/${lessonId}.${lang}.json`);
const script = JSON.parse(await readFile(scriptFile, 'utf8'));

console.log(`${name}:`);
const voDir = join(outDir, 'vo', name);
await runVo(scriptFile, voDir);
const vo = JSON.parse(await readFile(join(voDir, 'vo.json'), 'utf8'));
for (const [id, line] of Object.entries(vo.lines))
{
  if (line.match < 0.85)
  {
    console.warn(`  warning: the line "${id}" was heard as "${line.heard}" (match ${line.match})`);
  }
}

const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
try
{
  const recDir = join(outDir, 'recordings');
  await mkdir(recDir, { recursive: true });
  let timeline = null;
  if (args.includes('--reuse'))
  {
    try
    {
      timeline = JSON.parse(await readFile(join(recDir, `${name}.timeline.json`), 'utf8'));
      await access(timeline.file);
      console.log(`  the last recording (${timeline.seconds.toFixed(1)} s)`);
    }
    catch
    {
      timeline = null;
    }
  }
  if (!timeline)
  {
    timeline = await recordLesson(browser, base, lesson, { script, vo, voDir, dir: recDir, name });
  }
  const files = await renderLesson(browser, base, { timeline, vo, outDir, name, subtitles: !args.includes('--no-subtitles') });
  if (args.includes('--check'))
  {
    const frames = (option('frames', '') || '').split(',').filter(Boolean).map(Number);
    for (const file of [files.full, files.share])
    {
      console.log(describe(await checkVideo(file, { frames: file === files.full ? frames : [], outDir: join(outDir, 'check') })));
    }
  }
}
finally
{
  await browser.close();
  server.close();
}
