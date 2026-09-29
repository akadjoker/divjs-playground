// Subtitles from the narration: each line is cut into short cues at its
// sentences (and at commas when a sentence is long), timed by the words'
// times that vo.py aligned to the recording. Writes an .srt (to publish
// with the video) and an .ass (burned into it, styled for 1920x1080).

import { writeFile } from 'node:fs/promises';

const MAX = 62;

function chunks(words)
{
  const out = [];
  let cur = [];
  const len = (list) => list.map((w) => w.w).join(' ').length;
  words.forEach((word, i) =>
  {
    cur.push(word);
    const next = words[i + 1];
    const end = /[.!?]$/.test(word.w);
    const soft = /[,:;]$/.test(word.w) && len(cur) >= 26;
    const full = next && len(cur) + 1 + next.w.length > MAX;
    if (!next || end || soft || full)
    {
      out.push(cur);
      cur = [];
    }
  });
  // A word or two left on their own go with the cue before (two lines).
  for (let i = out.length - 1; i > 0; i--)
  {
    if (len(out[i]) < 14 && !/[.!?]$/.test(out[i - 1][out[i - 1].length - 1].w) && len(out[i - 1]) + len(out[i]) < 84)
    {
      out[i - 1] = out[i - 1].concat(out[i]);
      out.splice(i, 1);
    }
  }
  return out;
}

// timeline: recordLesson's ({ lines: [{ id, start }] }); vo: vo.py's report.
export function subtitleCues(timeline, vo)
{
  const cues = [];
  for (const line of timeline.lines)
  {
    for (const part of chunks(vo.lines[line.id].words))
    {
      cues.push({
        start: line.start + part[0].start,
        end: line.start + part[part.length - 1].end + 0.3,
        text: part.map((w) => w.w).join(' ')
      });
    }
  }
  cues.forEach((cue, i) =>
  {
    const next = cues[i + 1];
    cue.end = Math.max(cue.end, cue.start + 1.1);
    if (next)
    {
      cue.end = Math.min(cue.end, next.start - 0.04);
    }
  });
  return cues;
}

// Splits a cue into two balanced lines when it is long.
function wrap(text, width = 40)
{
  if (text.length <= width)
  {
    return [text];
  }
  const words = text.split(' ');
  let best = null;
  for (let i = 1; i < words.length; i++)
  {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const score = Math.max(a.length, b.length);
    if (!best || score < best.score)
    {
      best = { score, lines: [a, b] };
    }
  }
  return best.lines;
}

const stamp = (s, sep, digits) =>
{
  const ms = Math.round(s * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor(ms / 60000) % 60;
  const sec = Math.floor(ms / 1000) % 60;
  const frac = ms % 1000;
  const f = digits === 3 ? String(frac).padStart(3, '0') : String(Math.floor(frac / 10)).padStart(2, '0');
  const hh = digits === 3 ? String(h).padStart(2, '0') : String(h);
  return `${hh}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}${sep}${f}`;
};

export async function writeSrt(file, cues)
{
  const body = cues.map((c, i) => `${i + 1}\n${stamp(c.start, ',', 3)} --> ${stamp(c.end, ',', 3)}\n${wrap(c.text).join('\n')}\n`).join('\n');
  await writeFile(file, body);
}

export async function writeAss(file, cues, { width = 1920, height = 1080 } = {})
{
  const head = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,46,&H00FFFFFF,&H00FFFFFF,&H3A15100D,&H00000000,1,0,0,0,100,100,0,0,3,12,0,2,120,120,34,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const events = cues.map((c) => `Dialogue: 0,${stamp(c.start, '.', 2)},${stamp(c.end, '.', 2)},Default,,0,0,0,,${wrap(c.text).join('\\N')}`);
  await writeFile(file, head + events.join('\n') + '\n');
}
