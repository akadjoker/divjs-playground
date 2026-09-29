// ffmpeg and WAV helpers for the trailer tools.

import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import ffmpegPath from 'ffmpeg-static';

export const FPS = 60;
export const RATE = 44100;

// Runs ffmpeg with `args`; resolves with its stderr (where it reports).
// `input` (optional) gets a writable stream to feed stdin: writeFrame()
// below waits for it to drain.
export function ffmpeg(args, { input, quiet = true } = {})
{
  return new Promise((resolve, reject) =>
  {
    const child = spawn(ffmpegPath, ['-hide_banner', '-y', ...args], { stdio: [input ? 'pipe' : 'ignore', 'ignore', 'pipe'] });
    let log = '';
    child.stderr.on('data', (d) =>
    {
      log += d;
      if (!quiet)
      {
        process.stderr.write(d);
      }
    });
    child.on('error', reject);
    child.on('close', (code) =>
    {
      if (code === 0)
      {
        resolve(log);
      }
      else
      {
        reject(new Error(`ffmpeg ${args.join(' ')}\nexited with ${code}:\n${log.slice(-3000)}`));
      }
    });
    if (input)
    {
      input(child.stdin);
    }
  });
}

// Writes one chunk to a stream, waiting when its buffer is full.
export function writeFrame(stream, bytes)
{
  return new Promise((resolve, reject) =>
  {
    stream.write(bytes, (err) => (err ? reject(err) : resolve()));
  });
}

// A lossless 60 fps video encoder fed with raw RGBA frames or PNG images.
// Returns { write(bytes), close() }.
export function frameEncoder(file, { width, height, png = false })
{
  let stdin = null;
  const input = png
    ? ['-f', 'image2pipe', '-c:v', 'png', '-framerate', String(FPS), '-i', '-']
    : ['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-framerate', String(FPS), '-i', '-'];
  const done = ffmpeg([...input, '-c:v', 'ffv1', '-pix_fmt', 'bgr0', file], { input: (s) => { stdin = s; } });
  return {
    write: (bytes) => writeFrame(stdin, bytes),
    close: async () =>
    {
      stdin.end();
      await done;
    }
  };
}

// ── WAV (32-bit float, stereo) ──────────────────────────────────────────

export async function writeWav(file, left, right, rate = RATE)
{
  const frames = left.length;
  const data = Buffer.alloc(frames * 8);
  for (let i = 0; i < frames; i++)
  {
    data.writeFloatLE(left[i], i * 8);
    data.writeFloatLE(right[i], i * 8 + 4);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(3, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 8, 28);
  header.writeUInt16LE(8, 32);
  header.writeUInt16LE(32, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  await writeFile(file, Buffer.concat([header, data]));
}

// Reads any WAV ffmpeg understands (a voiceover, say) as stereo float
// channels at RATE.
export async function readWav(file)
{
  const raw = `${file}.f32`;
  await ffmpeg(['-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(RATE), raw]);
  const bytes = await readFile(raw);
  const frames = bytes.length / 8;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i++)
  {
    left[i] = bytes.readFloatLE(i * 8);
    right[i] = bytes.readFloatLE(i * 8 + 4);
  }
  return { left, right };
}

// Base64 of a Float32Array's bytes -> Float32Array.
export function floatsFromBase64(b64)
{
  const bytes = Buffer.from(b64, 'base64');
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
}
