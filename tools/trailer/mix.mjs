// The soundtrack of a video: the music take, the games' own sound under
// their footage and, when there is one, the narration, with the music and
// game sound ducked under the voice. Each stem is first brought to a
// set loudness (so a loud game does not bury the music), then the mix is
// normalised to -14 LUFS / -2 dBTP (AAC encoding adds a little on top)
// with ffmpeg's loudnorm in two passes.

import { join } from 'node:path';
import { RATE, ffmpeg, readWav, writeWav } from './media.mjs';

// Stem loudness targets (LUFS, before the final normalisation) and ducking.
export const MIX = { music: -20, game: -25, voice: -15, duck: -8, target: -14, truePeak: -2 };

const db = (value) => Math.pow(10, value / 20);

// Integrated loudness of a WAV (LUFS), or null when it is silent.
async function loudness(file)
{
  const log = await ffmpeg(['-nostats', '-i', file, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-']);
  const m = /I:\s+(-?[\d.]+) LUFS/.exec(log.slice(log.lastIndexOf('Summary')));
  const value = m ? Number(m[1]) : null;
  return value !== null && value > -69 ? value : null;
}

// Speech envelope of `voice` (0..1 per sample): on while it is louder than
// -45 dBFS (10 ms windows), held 150 ms, 60 ms in, 300 ms out.
function speechEnvelope(voice)
{
  const win = Math.round(RATE * 0.01);
  const windows = Math.ceil(voice.length / win);
  const on = new Uint8Array(windows);
  const threshold = db(-45);
  for (let w = 0; w < windows; w++)
  {
    let sum = 0;
    const end = Math.min(voice.length, (w + 1) * win);
    for (let i = w * win; i < end; i++)
    {
      sum += voice[i] * voice[i];
    }
    on[w] = Math.sqrt(sum / Math.max(1, end - w * win)) > threshold ? 1 : 0;
  }
  const hold = 15;
  const held = new Uint8Array(windows);
  for (let w = 0; w < windows; w++)
  {
    if (on[w])
    {
      for (let k = Math.max(0, w - 6); k <= Math.min(windows - 1, w + hold); k++)
      {
        held[k] = 1;
      }
    }
  }
  const env = new Float32Array(voice.length);
  const up = 1 / (RATE * 0.06);
  const down = 1 / (RATE * 0.3);
  let level = 0;
  for (let i = 0; i < voice.length; i++)
  {
    const want = held[Math.floor(i / win)];
    level = want > level ? Math.min(want, level + up) : Math.max(want, level - down);
    env[i] = level;
  }
  return env;
}

// Adds `src` (from sample `from`, `count` samples) into `dst` at `at`, with
// `gain` and 10 ms fades at both ends.
function place(dst, src, at, from, count, gain)
{
  const fade = Math.round(RATE * 0.01);
  for (let i = 0; i < count; i++)
  {
    const s = from + i;
    const d = at + i;
    if (s < 0 || s >= src.length || d < 0 || d >= dst.length)
    {
      continue;
    }
    const edge = Math.min(1, i / fade, (count - 1 - i) / fade);
    dst[d] += src[s] * gain * edge;
  }
}

// plan: see render.mjs. Returns the path of the normalised mix (48 kHz WAV).
export async function mixAudio(plan, { takesDir, workDir, musicTake, musicDelay, log = console.log })
{
  const length = Math.round(plan.total * RATE);
  const stems = {
    music: [new Float32Array(length), new Float32Array(length)],
    game: [new Float32Array(length), new Float32Array(length)],
    voice: [new Float32Array(length), new Float32Array(length)]
  };
  const music = await readWav(join(takesDir, `${musicTake}.wav`));
  const skip = Math.round(musicDelay * RATE);
  stems.music.forEach((ch, c) => place(ch, c ? music.right : music.left, 0, skip, length, 1));

  const cache = new Map();
  for (const seg of plan.segments)
  {
    const at = Math.round(seg.start * RATE);
    const count = Math.round(seg.seconds * RATE);
    if (seg.take && seg.takeMeta.audio && seg.gameSound !== false)
    {
      if (!cache.has(seg.take))
      {
        cache.set(seg.take, await readWav(join(takesDir, `${seg.take}.wav`)));
      }
      const sound = cache.get(seg.take);
      const from = Math.round(seg.from * RATE);
      stems.game.forEach((ch, c) => place(ch, c ? sound.right : sound.left, at, from, count, db(seg.gameGain || 0)));
    }
    if (seg.vo)
    {
      const voice = await readWav(seg.vo.file);
      const start = at + Math.round(seg.vo.lead * RATE);
      stems.voice.forEach((ch, c) => place(ch, c ? voice.right : voice.left, start, 0, voice.left.length, 1));
    }
  }

  // Each stem to its loudness target.
  const gains = {};
  for (const [name, [l, r]] of Object.entries(stems))
  {
    const file = join(workDir, `stem-${name}.wav`);
    await writeWav(file, l, r);
    const measured = await loudness(file);
    gains[name] = measured === null ? 0 : MIX[name] - measured;
    log(`  ${name}: ${measured === null ? 'silent' : `${measured.toFixed(1)} LUFS, ${gains[name] >= 0 ? '+' : ''}${gains[name].toFixed(1)} dB`}`);
  }
  const env = speechEnvelope(stems.voice[0]);
  const duck = 1 - db(MIX.duck);
  const out = [new Float32Array(length), new Float32Array(length)];
  for (let c = 0; c < 2; c++)
  {
    const m = db(gains.music);
    const g = db(gains.game);
    const v = db(gains.voice);
    for (let i = 0; i < length; i++)
    {
      const under = 1 - duck * env[i];
      out[c][i] = (stems.music[c][i] * m + stems.game[c][i] * g) * under + stems.voice[c][i] * v;
    }
  }
  const mixFile = join(workDir, 'mix.wav');
  await writeWav(mixFile, out[0], out[1]);

  // Two-pass loudnorm: measure, then correct with the measured values.
  const target = `I=${MIX.target}:TP=${MIX.truePeak}:LRA=11`;
  const first = await ffmpeg(['-nostats', '-i', mixFile, '-af', `loudnorm=${target}:print_format=json`, '-f', 'null', '-']);
  const json = JSON.parse(first.slice(first.lastIndexOf('{'), first.lastIndexOf('}') + 1));
  const measured = `measured_I=${json.input_i}:measured_TP=${json.input_tp}:measured_LRA=${json.input_lra}:measured_thresh=${json.input_thresh}:offset=${json.target_offset}`;
  const normFile = join(workDir, 'mix-norm.wav');
  await ffmpeg(['-i', mixFile, '-af', `loudnorm=${target}:${measured}:linear=true`, '-ar', '48000', '-c:a', 'pcm_s16le', normFile]);
  log(`  mix: ${json.input_i} LUFS, ${json.input_tp} dBTP -> ${MIX.target} LUFS`);
  return normFile;
}
