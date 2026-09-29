// From a recorded lesson to the finished videos: the music bed (the DIV
// soundtrack of tools/trailer/music.mjs, played by DivJS), the mix
// (tools/trailer/mix.mjs: the voice on top, the music ducked under it,
// -14 LUFS), the subtitles, and the two encodes:
//   <out>/<name>.mp4        1920x1080, 30 fps, H.264 + AAC, +faststart
//   <out>/<name>-share.mp4  1280x720, capped to fit ~14 MB
//   <out>/<name>.srt        the subtitles

import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { ffmpeg } from '../trailer/media.mjs';
import { mixAudio, MIX as TRAILER_MIX } from '../trailer/mix.mjs';
import { soundtrackSource, MUSIC_DELAY } from '../trailer/music.mjs';
import { recordTakes } from '../trailer/capture.mjs';
import { COLORS } from '../trailer/cards.mjs';
import { VIDEO, MIX } from './config.mjs';
import { subtitleCues, writeAss, writeSrt } from './subtitles.mjs';

const SHARE_BYTES = 14.2e6;

// The music: a calm bed (pads and a soft arpeggio) under the whole
// lesson, the intro's quieter bars under the title card, one last chord at
// the end. Recorded (and kept) like the trailer's takes.
async function recordMusic(browser, base, seconds, takesDir, log)
{
  const total = Math.ceil(seconds);
  const sections = [{ start: 0, music: 'intro' }, { start: 4, music: 'calm' }, { start: Math.max(6, Math.floor((total - 3) / 2) * 2), music: 'end' }];
  const name = `music-tutorial-${total}`;
  const take = {
    url: 'tools/trailer/stage.html',
    seconds: total + 1,
    audio: true,
    audioSeconds: total + 6,
    source: soundtrackSource(sections, total),
    ready: async ({ page, take: tk }) =>
    {
      const errors = await page.evaluate(([s, c]) => window.startStage(s, 32, 32, c), [tk.source, COLORS.bg]);
      if (errors.length > 0)
      {
        throw new Error(`the music did not start: ${errors.join('; ')}`);
      }
    }
  };
  await recordTakes(browser, base, { [name]: take }, takesDir, { log });
  return name;
}

// timeline: from recordLesson; vo: vo.py's report.
export async function renderLesson(browser, base, { timeline, vo, outDir, name, subtitles = true, log = console.log })
{
  const work = join(outDir, 'work', name);
  const takesDir = join(outDir, 'takes');
  await mkdir(work, { recursive: true });

  const cues = subtitleCues(timeline, vo);
  const srt = join(outDir, `${name}.srt`);
  const ass = join(work, 'subtitles.ass');
  await writeSrt(srt, cues);
  await writeAss(ass, cues, VIDEO);

  const music = await recordMusic(browser, base, timeline.seconds, takesDir, log);
  // The trailer's mixer with this video's levels (a quieter music bed).
  Object.assign(TRAILER_MIX, { music: MIX.music, voice: MIX.voice, duck: MIX.duck });
  const plan = {
    total: timeline.seconds,
    segments: timeline.lines.map((line) => ({ id: line.id, start: line.start, vo: { file: line.file, lead: 0 } }))
  };
  const audio = await mixAudio(plan, { takesDir, workDir: work, musicTake: music, musicDelay: MUSIC_DELAY, log });

  const burn = subtitles ? `ass=${ass},` : '';
  const common = ['-c:a', 'aac', '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-map', '0:v', '-map', '1:a', '-shortest'];
  const full = join(outDir, `${name}.mp4`);
  await ffmpeg(['-i', timeline.file, '-i', audio, '-vf', `${burn}format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
    '-r', String(VIDEO.fps), '-g', String(VIDEO.fps * 2), '-b:a', '192k', ...common, full]);

  const audioKbps = 128;
  const videoKbps = Math.floor(SHARE_BYTES * 8 / timeline.seconds / 1000 - audioKbps - 40);
  const share = join(outDir, `${name}-share.mp4`);
  await ffmpeg(['-i', timeline.file, '-i', audio, '-vf', `${burn}scale=1280:720:flags=lanczos`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '21',
    '-maxrate', `${videoKbps}k`, '-bufsize', `${videoKbps * 2}k`, '-r', String(VIDEO.fps), '-g', String(VIDEO.fps * 2), '-b:a', `${audioKbps}k`, ...common, share]);
  const sizes = await Promise.all([full, share].map(async (f) => (await stat(f)).size));
  log(`  ${full} (${(sizes[0] / 1e6).toFixed(1)} MB)\n  ${share} (${(sizes[1] / 1e6).toFixed(1)} MB)\n  ${srt} (${cues.length} cues)`);
  return { full, share, srt };
}
