// Writes the DIV program that plays a video's soundtrack: a song for the
// engine's own sequencer (song_new / song_track, see engine/natives.md)
// arranged bar by bar from the segments' `music` sections, and a sound
// effect (sfx) on the cuts that ask for a `hit`. It is recorded like the
// other takes; its sound is the music bed of the mix.
//
// 120 bpm, 16 steps a bar (2 s). Sections: intro, main, calm, end.

// A minor: Am F C G, one chord a bar.
const CHORDS = [
  { root: 'A', arp: ['A4', 'C5', 'E5', 'C5'], pad: ['A4', 'E5'] },
  { root: 'F', arp: ['F4', 'A4', 'C5', 'A4'], pad: ['F4', 'C5'] },
  { root: 'C', arp: ['C4', 'E4', 'G4', 'E4'], pad: ['C5', 'G4'] },
  { root: 'G', arp: ['G4', 'B4', 'D5', 'B4'], pad: ['G4', 'D5'] }
];

// A four-bar tune for the lead, one line of 16 steps per chord.
const LEAD = [
  'E5 - - . E5 . D5 . C5 - . . A4 - . .',
  'C5 - - . C5 . D5 . F5 - . . E5 - . .',
  'E5 - . . G5 - . . E5 . D5 . C5 - . .',
  'D5 - - - . . B4 . D5 - . . G5 - - .'
];

const DRUMS = {
  intro: 'k . . . h . . . k . . . h . . .',
  main: 'k . h . s . h . k . h k s . h h',
  calm: 'k . . . h . . . . . k . h . . .',
  fill: 'k . h . s . h . s . s . s s s s'
};

const hold = (note, steps) => [note, ...Array(steps - 1).fill('-')].join(' ');
const rest = (steps) => Array(steps).fill('.').join(' ');

// The notes of one bar, per track.
function bar(section, index, nextSection)
{
  const chord = CHORDS[index % 4];
  // The bar before a new section ends on a drum fill.
  const fill = nextSection && nextSection !== section;
  if (section === 'end')
  {
    // One last chord, held, then quiet.
    return {
      drums: 'ks . . . . . . . . . . . . . . .',
      bass: hold('A3', 16),
      arp: rest(16),
      lead: hold('A5', 12) + ' . . . .',
      pad1: hold('A4', 16),
      pad2: hold('E5', 16)
    };
  }
  const arp = Array(4).fill(chord.arp.join(' ')).join(' ');
  if (section === 'intro')
  {
    return {
      drums: fill ? DRUMS.fill : DRUMS.intro,
      bass: hold(`${chord.root}3`, 16),
      arp: rest(16),
      lead: rest(16),
      pad1: hold(chord.pad[0], 16),
      pad2: hold(chord.pad[1], 16)
    };
  }
  if (section === 'calm')
  {
    return {
      drums: fill ? DRUMS.fill : DRUMS.calm,
      bass: `${hold(`${chord.root}3`, 6)} . . ${hold(`${chord.root}3`, 6)} . .`,
      arp,
      lead: rest(16),
      pad1: hold(chord.pad[0], 16),
      pad2: hold(chord.pad[1], 16)
    };
  }
  const b = `${chord.root}3`;
  return {
    drums: fill ? DRUMS.fill : DRUMS.main,
    bass: `${b} . ${b} . ${b} . ${b} . ${b} . ${b} . ${b} . ${b} .`,
    arp,
    lead: LEAD[index % 4],
    pad1: rest(16),
    pad2: rest(16)
  };
}

// segments: [{ start, seconds, music, hit }] (music: the section from
// then on, hit: sfx name played on the cut). Returns DIV source.
export function soundtrackSource(segments, totalSeconds)
{
  const bars = Math.ceil(totalSeconds / 2);
  const sectionAt = (t) =>
  {
    let section = 'intro';
    for (const s of segments)
    {
      if (s.music && s.start <= t + 1e-6)
      {
        section = s.music;
      }
    }
    return section;
  };
  const tracks = { drums: [], bass: [], arp: [], lead: [], pad1: [], pad2: [] };
  let endBars = 0;
  for (let i = 0; i < bars; i++)
  {
    const section = sectionAt(i * 2);
    const next = sectionAt((i + 1) * 2);
    let notes;
    if (section === 'end')
    {
      notes = endBars === 0 ? bar('end', 0) : { drums: rest(16), bass: rest(16), arp: rest(16), lead: rest(16), pad1: rest(16), pad2: rest(16) };
      endBars++;
    }
    else
    {
      notes = bar(section, i, next);
    }
    for (const k of Object.keys(tracks))
    {
      tracks[k].push(notes[k]);
    }
  }
  const line = (k) => tracks[k].join(' | ');
  const hits = segments.filter((s) => s.hit).map((s) => ({ frame: Math.max(0, Math.round(s.start * 60) - 1), hit: s.hit }));
  const names = [...new Set(hits.map((h) => h.hit))];
  return `PROGRAM soundtrack;

// Made by tools/trailer/music.mjs - the music of a DivJS trailer.

GLOBAL
  tick = 0;
  song;
  quiet;
${names.map((n) => `  snd_${n};`).join('\n')}

BEGIN
  set_mode(32, 32);
  set_fps(60, 0);
  quiet = sfx_tone(wave_sine, 440, 440, 10, 0);
${names.map((n) => `  snd_${n} = sfx(sfx_${n});`).join('\n')}
  song = song_new(120);
  song_track(song, inst_drums, "${line('drums')}", 70);
  song_track(song, inst_bass, "${line('bass')}", 80);
  song_track(song, inst_pluck, "${line('arp')}", 35);
  song_track(song, inst_square, "${line('lead')}", 40);
  song_track(song, inst_pad, "${line('pad1')}", 45);
  song_track(song, inst_pad, "${line('pad2')}", 40);
  // A silent sound first: it opens the audio output, so the song starts now.
  play_sound(quiet, 0);
  song_play(song, 0);
  LOOP
${hits.map((h) => `    IF (tick == ${h.frame}) play_sound(snd_${h.hit}, 70); END`).join('\n')}
    tick = tick + 1;
    FRAME;
  END
END
`;
}

// The song starts one frame after recording begins, plus the engine's
// 50 ms scheduling margin: the mix skips this much of the music take.
export const MUSIC_DELAY = 1 / 60 + 0.05;
